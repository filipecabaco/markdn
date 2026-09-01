defmodule Markdn.RouterTest do
  use Markdn.DocumentCase, async: false

  import Plug.Test
  import Plug.Conn

  @opts Markdn.init([])

  # Plug.Test defaults the host to www.example.com, which LocalGuard rejects, so
  # every request here is addressed to localhost like a real webview request.
  defp call(method, path, body \\ nil) do
    conn =
      case body do
        nil ->
          conn(method, "http://localhost#{path}")

        body ->
          method
          |> conn("http://localhost#{path}", Jason.encode!(body))
          |> put_req_header("content-type", "application/json")
      end

    Markdn.call(conn, @opts)
  end

  test "health reports the active root", %{root: root} do
    conn = call(:get, "/api/health")
    assert conn.status == 200
    assert %{"status" => "ok", "root" => ^root} = Jason.decode!(conn.resp_body)
  end

  test "documents can be written and read back over the API" do
    write = call(:post, "/api/document", %{path: "a.md", contents: "# A"})
    assert write.status == 200

    read = call(:get, "/api/document?path=a.md")
    assert %{"contents" => "# A"} = Jason.decode!(read.resp_body)
  end

  test "a missing document is 404" do
    assert call(:get, "/api/document?path=ghost.md").status == 404
  end

  test "traversal outside the root is 403" do
    conn = call(:get, "/api/document?path=../../etc/passwd")
    assert conn.status == 403
    assert Jason.decode!(conn.resp_body)["error"] =~ "outside"
  end

  test "a non-markdown file is 415" do
    assert call(:get, "/api/document?path=id_rsa").status == 415
  end

  test "MCP responds on POST /mcp" do
    conn = call(:post, "/mcp", %{jsonrpc: "2.0", id: 7, method: "tools/list"})
    assert conn.status == 200
    assert %{"id" => 7, "result" => %{"tools" => _}} = Jason.decode!(conn.resp_body)
  end

  test "an MCP notification gets 202 with no body" do
    conn = call(:post, "/mcp", %{jsonrpc: "2.0", method: "notifications/initialized"})
    assert conn.status == 202
    assert conn.resp_body == ""
  end

  describe "LocalGuard" do
    test "rejects a request with a non-loopback Host" do
      conn = Markdn.call(conn(:get, "http://evil.test/api/health"), @opts)
      assert conn.status == 403
    end

    test "rejects a cross-origin request from a browser" do
      conn =
        :get
        |> conn("http://localhost/api/health")
        |> put_req_header("origin", "https://evil.test")
        |> Markdn.call(@opts)

      assert conn.status == 403
    end

    test "allows a same-origin loopback request" do
      conn =
        :get
        |> conn("http://localhost/api/health")
        |> put_req_header("origin", "http://localhost:43118")
        |> Markdn.call(@opts)

      assert conn.status == 200
    end
  end
end
