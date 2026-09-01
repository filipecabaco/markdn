defmodule Markdn.Plugs.LocalGuard do
  @moduledoc """
  Rejects browser-borne cross-origin and DNS-rebinding requests.

  The server binds to loopback, but that alone does not protect it: a page on any
  website can point a hostname it controls at 127.0.0.1 and have the victim's
  browser issue same-origin requests to this server. Since the routes read and
  write files, that would be a file-disclosure hole.

  Requests are allowed when the `Host` header names a loopback address, and any
  `Origin` header present also names one. Non-browser clients (the MCP stdio
  bridge, curl) send no Origin and are unaffected.
  """

  @behaviour Plug

  import Plug.Conn

  @loopback_hosts ~w(localhost 127.0.0.1 [::1] ::1)

  @impl true
  def init(opts), do: opts

  @impl true
  def call(conn, _opts) do
    with :ok <- check_host(conn),
         :ok <- check_origin(conn) do
      conn
    else
      {:error, reason} ->
        conn
        |> send_resp(403, "forbidden: #{reason}")
        |> halt()
    end
  end

  # `conn.host`, not the raw "host" header: Plug populates it from the Host header
  # on HTTP/1.1 and from the `:authority` pseudo-header on HTTP/2, which carries no
  # "host" header at all. Reading the header directly would leave every HTTP/2
  # request unguarded, and the port is already split out into `conn.port`.
  defp check_host(conn) do
    if conn.host in @loopback_hosts, do: :ok, else: {:error, "unexpected host"}
  end

  defp check_origin(conn) do
    case get_req_header(conn, "origin") do
      [] ->
        :ok

      [origin | _] ->
        uri = URI.parse(origin)
        if uri.host in @loopback_hosts, do: :ok, else: {:error, "cross-origin request"}
    end
  end
end
