defmodule Markdn.Opener do
  @moduledoc """
  Files and folders handed to the app from outside the window: `markdn notes.md`
  in a terminal, `open -a markdn notes.md`, Finder's "Open With".

  The Tauri shell collects them (its argv on first launch, a second launch's argv
  through the single-instance plugin, macOS open-file events) and sends them down
  the sidecar channel as an `"open_paths"` event with absolute paths. Each one is
  resolved here, once, against the root:

    - a markdown file inside the root is opened by its root-relative path;
    - a markdown file outside it moves the root to the file's folder first, the
      way `code some/file` opens that file wherever it lives;
    - a directory becomes the root, the way `code .` does.

  A root pinned by `MARKDN_ROOT` is never moved: a path that would need it is
  reported instead.

  The result waits here until a window takes it (`take/0`), rather than being
  pushed to whichever windows happen to be connected. On first launch the event
  arrives while the window is still loading, and a push would land on nobody; a
  window instead asks on load and on every socket (re)connect, and a `"open"`
  message on the socket tells a connected one to ask now.
  """

  use GenServer

  require Logger

  alias Markdn.Documents
  alias Markdn.Settings

  @typedoc "What a window should do: open `document`, after re-reading the tree when `root` moved."
  @type request :: %{document: String.t() | nil, root: String.t() | nil, error: String.t() | nil}

  @empty %{document: nil, root: nil, error: nil}

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  @doc """
  Resolves `paths` (absolute, or relative to the backend's working directory) and
  holds the result for the next `take/0`, then tells the connected windows.
  """
  @spec request([String.t()]) :: :ok
  def request(paths) when is_list(paths), do: GenServer.call(__MODULE__, {:request, paths})

  @doc "Hands back the pending request, if any, and clears it."
  @spec take() :: request()
  def take, do: GenServer.call(__MODULE__, :take)

  @impl true
  def init(opts) do
    # Only the packaged sidecar has a shell to hear from. Subscribed in init, not
    # a continue: the supervisor starts Bandit after this, and the shell only
    # connects once the port answers, so no event can arrive unheard.
    if Keyword.get(opts, :subscribe, false), do: ExTauri.Desktop.subscribe()
    {:ok, @empty}
  end

  @impl true
  def handle_call({:request, paths}, _from, pending) do
    {:reply, :ok, enqueue(paths, pending)}
  end

  def handle_call(:take, _from, pending), do: {:reply, pending, @empty}

  @impl true
  def handle_info({:ex_tauri_event, "open_paths", %{"paths" => paths}}, pending)
      when is_list(paths) do
    {:noreply, enqueue(Enum.filter(paths, &is_binary/1), pending)}
  end

  # Menu and tray clicks reach every subscriber; none of them are ours.
  def handle_info({:ex_tauri_event, _name, _payload}, pending), do: {:noreply, pending}

  defp enqueue([], pending), do: pending

  defp enqueue(paths, pending) do
    pending = Enum.reduce(paths, pending, &apply_path/2)
    Markdn.notify_open()
    pending
  end

  # Later paths win: `markdn ~/notes ~/notes/todo.md` moves the root, then opens
  # the file inside it. Errors are kept, so one bad argument does not hide.
  defp apply_path(path, pending) do
    case resolve(Path.expand(path)) do
      {:ok, %{root: nil} = result} ->
        %{pending | document: result.document}

      {:ok, result} ->
        %{pending | document: result.document, root: result.root}

      {:error, message} ->
        Logger.warning("[opener] #{message}")
        %{pending | error: join_errors(pending.error, message)}
    end
  end

  defp resolve(path) do
    cond do
      File.dir?(path) -> move_root(path, nil)
      not File.regular?(path) -> {:error, "#{path} does not exist"}
      not markdown?(path) -> {:error, "#{Path.basename(path)} is not a markdown document"}
      true -> open_file(path)
    end
  end

  defp open_file(path) do
    case Documents.relative_path(path) do
      {:ok, relative} -> {:ok, %{document: relative, root: nil}}
      {:error, :outside_root} -> move_root(Path.dirname(path), Path.basename(path))
    end
  end

  defp move_root(dir, document) do
    cond do
      dir == Documents.root() ->
        {:ok, %{document: document, root: nil}}

      Documents.root_locked?() ->
        {:error, "#{dir} is outside the markdn root, which MARKDN_ROOT pins"}

      match?({:ok, _}, Settings.put(%{"root" => dir})) ->
        {:ok, %{document: document, root: Documents.root()}}

      true ->
        {:error, "#{dir} cannot be used as the root"}
    end
  end

  defp markdown?(path), do: String.downcase(Path.extname(path)) in Documents.extensions()

  defp join_errors(nil, message), do: message
  defp join_errors(previous, message), do: previous <> "\n" <> message
end
