defmodule Markdn do
  @moduledoc """
  Application entry point and HTTP router.

  MarkDN is a markdown/MDX viewer and editor. Francis serves three things on one
  loopback port:

    - the built React SPA out of `priv/static`,
    - a small document API (`/api/*`) the SPA uses to read and write files,
    - an MCP server at `POST /mcp`, so an agent can read and write the same
      documents the user is editing.

  ## Why Bandit is supervised here

  `use Francis` supplies the router; it does not start the server in this app.
  `start/2` starts Bandit itself with `plug: __MODULE__` and merges
  `Application.get_env(:markdn, :bandit_opts)`, which is what lets
  `config/runtime.exs` bind the ephemeral `PORT` that the Tauri shell injects.
  Francis 0.3.3 resolves its own `:bandit_opts` from the `use Francis` macro
  options only and silently ignores application env, so the documented
  `config :francis, bandit_opts: ...` recipe would bind port 4000 while the
  webview pointed somewhere else — a blank window with no error.
  """

  use Francis

  require Logger

  alias Markdn.Documents
  alias Markdn.MCP.Components
  alias Markdn.MCP.Handler
  alias Markdn.Settings

  # Runs before every route. Must be declared before the route macros.
  plug(Markdn.Plugs.LocalGuard)

  @impl true
  def start(_type, _args) do
    if desktop_sidecar?(), do: redirect_logs_to_file()

    children =
      [
        # Duplicate keys: every connected websocket registers under :all so a save
        # can be fanned out to the other windows.
        {Registry, keys: :duplicate, name: Markdn.Sockets},
        {Bandit,
         [plug: __MODULE__, startup_log: false] ++
           Application.get_env(:markdn, :bandit_opts, [])}
      ] ++ shutdown_manager()

    Supervisor.start_link(children, strategy: :one_for_one, name: Markdn.Supervisor)
  end

  # ExTauri.ShutdownManager stops the VM when the Tauri heartbeat stops arriving.
  # Only added when actually running as the desktop sidecar, so a plain
  # `mix francis.server` boot is not killed a second after it starts.
  defp shutdown_manager do
    if desktop_sidecar?(), do: [ExTauri.ShutdownManager], else: []
  end

  # Two spellings: a plain mix release (`mix ex_tauri.dev`) exports RELEASE_NAME,
  # while the shipped Burrito-wrapped build sets __BURRITO but never RELEASE_NAME.
  defp desktop_sidecar? do
    System.get_env("RELEASE_NAME") == "desktop" or System.get_env("__BURRITO") == "1"
  end

  # The sidecar's stdout is a pipe Tauri owns: nobody sees it when the app is
  # launched from Finder, and a dead GUI leaves it broken, which destabilises
  # node IO on the path ShutdownManager needs to stop the VM. Log to a file
  # instead. Best-effort — a failure here keeps the default handler.
  defp redirect_logs_to_file do
    path = Path.join(System.tmp_dir!(), "markdn_desktop.log")

    :ok =
      :logger.add_handler(:markdn_file, :logger_std_h, %{
        config: %{type: {:file, String.to_charlist(path)}},
        formatter: Logger.Formatter.new()
      })

    :logger.remove_handler(:default)
    :ok
  rescue
    _ -> :ok
  end

  # --- SPA -----------------------------------------------------------------

  # Plug.Static (configured via `config :francis, static:`) serves the hashed
  # bundle, but does not serve an index for "/", so the shell is served here.
  get("/", fn conn -> serve_index(conn) end)

  # --- Document API --------------------------------------------------------

  get("/api/health", fn _conn ->
    %{
      status: "ok",
      root: Documents.root(),
      rootLocked: Documents.root_locked?(),
      settingsPath: Settings.path()
    }
  end)

  get("/api/components", fn _conn -> %{components: Components.all()} end)

  get("/api/documents", fn conn ->
    conn.params
    |> Map.get("path", ".")
    |> Documents.list()
    |> case do
      {:ok, entries} -> %{entries: entries}
      {:error, reason} -> api_error(conn, reason)
    end
  end)

  # Fuzzy file finder behind the command palette. A blank query is legitimate —
  # it asks for the most recently touched documents, which is what the palette
  # shows before the user types.
  get("/api/search", fn conn ->
    query = conn.params["q"] || ""

    %{query: query, results: Documents.search(query, limit: search_limit(conn.params["limit"]))}
  end)

  # --- Settings ------------------------------------------------------------

  get("/api/settings", fn _conn -> settings_payload() end)

  post("/api/settings", fn conn ->
    with %{} = attrs <- conn.body_params,
         :ok <- allow_root_change(attrs),
         {:ok, _settings} <- Settings.put(attrs) do
      settings_payload()
    else
      {:error, reason} -> api_error(conn, reason)
      _ -> api_error(conn, :invalid_settings)
    end
  end)

  get("/api/document", fn conn ->
    with path when is_binary(path) <- conn.params["path"],
         {:ok, contents} <- Documents.read(path) do
      %{path: path, contents: contents}
    else
      nil -> api_error(conn, :missing_path)
      {:error, reason} -> api_error(conn, reason)
    end
  end)

  post("/api/document", fn conn ->
    with %{"path" => path, "contents" => contents} <- conn.body_params,
         :ok <- Documents.write(path, contents) do
      %{path: path, saved: true}
    else
      {:error, reason} -> api_error(conn, reason)
      _ -> api_error(conn, :missing_path)
    end
  end)

  # Images referenced by a document. Served through the same root confinement as
  # everything else, so a document cannot pull a file the editor could not open.
  get("/api/image", fn conn ->
    with path when is_binary(path) <- conn.params["path"],
         {:ok, mime, bytes} <- Documents.read_image(path) do
      conn
      |> Plug.Conn.put_resp_content_type(mime)
      # The editor writes over previewed files, so a stale cached copy would show
      # the old picture. Revalidation is cheap on loopback.
      |> Plug.Conn.put_resp_header("cache-control", "no-cache")
      |> Plug.Conn.send_resp(200, bytes)
    else
      nil -> api_error(conn, :missing_path)
      {:error, reason} -> api_error(conn, reason)
    end
  end)

  # --- MCP -----------------------------------------------------------------

  # Streamable HTTP transport: the JSON-RPC response is this response's body.
  # A notification (no "id") gets 202 with an empty body, never a JSON-RPC reply.
  post("/mcp", fn conn ->
    case Handler.handle(conn.body_params) do
      {:reply, response} -> json(conn, response)
      :noreply -> Plug.Conn.send_resp(conn, 202, "")
    end
  end)

  # --- Live sync -----------------------------------------------------------

  # Broadcasts save notifications so a second window (or the MCP server writing a
  # file underneath the editor) can refresh the open document. The registry is a
  # duplicate-key Registry of connected transports.
  ws("/ws", fn
    :join, socket ->
      Registry.register(Markdn.Sockets, :all, socket.transport)
      {:reply, %{type: "connected", id: socket.id}}

    {:received, message}, socket ->
      # Qualified call: `ws/2` compiles this body into a generated module
      # (Francis.Ws), not into Markdn, so Markdn's own functions are not in scope.
      Markdn.broadcast(message, socket.transport)
      :noreply

    {:close, _reason}, _socket ->
      :ok
  end)

  # `unmatched/1` shadows anything declared after it, so it stays last.
  unmatched(fn conn -> Plug.Conn.send_resp(conn, 404, "not found") end)

  # --- Helpers -------------------------------------------------------------

  defp serve_index(conn) do
    index = Path.join(:code.priv_dir(:markdn), "static/index.html")

    case File.read(index) do
      {:ok, body} ->
        conn
        |> Plug.Conn.put_resp_content_type("text/html")
        |> Plug.Conn.send_resp(200, body)

      {:error, _} ->
        Plug.Conn.send_resp(
          conn,
          503,
          "frontend bundle missing - run `pnpm install && pnpm run build` in assets/"
        )
    end
  end

  @doc """
  Fans a message out to every connected websocket except `from`.

  Public because the `ws/2` handler body lives in a generated module and can only
  reach this through a qualified call.
  """
  @spec broadcast(term(), pid() | nil) :: :ok
  def broadcast(message, from) do
    Markdn.Sockets
    |> Registry.lookup(:all)
    |> Enum.each(fn {_pid, transport} ->
      if transport != from, do: send(transport, message)
    end)
  end

  @doc """
  Tells every connected window that `path` changed on disk.

  Called after an MCP client writes a document, so an agent editing a file the
  user has open does not leave the two silently out of step. `nil` as the sender
  means nobody is excluded — the writer here is not a websocket.
  """
  @spec notify_saved(String.t()) :: :ok
  def notify_saved(path) do
    broadcast(Jason.encode!(%{type: "saved", path: path}), nil)
  end

  defp settings_payload do
    %{
      settings: Settings.all(),
      defaults: Settings.defaults(),
      path: Settings.path(),
      root: Documents.root(),
      rootLocked: Documents.root_locked?()
    }
  end

  # A settings file must never be able to widen the confinement an operator set
  # with MARKDN_ROOT, so a root change is refused outright while it is pinned
  # rather than written and then ignored.
  defp allow_root_change(attrs) do
    if Map.has_key?(attrs, "root") and Documents.root_locked?(),
      do: {:error, :root_locked},
      else: :ok
  end

  # Clamped rather than rejected: an out-of-range limit is a client bug, and the
  # palette is more useful showing fewer results than an error.
  defp search_limit(nil), do: 50

  defp search_limit(value) do
    case Integer.parse(to_string(value)) do
      {limit, _} -> limit |> max(1) |> min(200)
      :error -> 50
    end
  end

  defp api_error(conn, reason) do
    {status, message} = describe(reason)
    json(conn, status, %{error: message})
  end

  defp describe(:outside_root), do: {403, "path is outside the MarkDN root"}
  defp describe(:unsupported_extension), do: {415, "not a markdown document"}
  defp describe(:missing_path), do: {400, "missing \"path\""}
  defp describe(:invalid_settings), do: {400, "settings must be a JSON object"}
  defp describe({:invalid, key}), do: {422, "invalid value for \"#{key}\""}

  defp describe(:root_locked),
    do: {409, "root is pinned by MARKDN_ROOT and cannot be changed from settings"}

  defp describe(:enoent), do: {404, "no such file or directory"}
  defp describe(:eacces), do: {403, "permission denied"}
  defp describe(other), do: {500, to_string(other)}
end
