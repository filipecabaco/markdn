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

  test "a new document is created with 201 and its normalised path", %{root: root} do
    conn = call(:post, "/api/document/new", %{path: "./ideas/first.md", contents: "# First"})
    assert conn.status == 201
    assert %{"path" => "ideas/first.md", "created" => true} = Jason.decode!(conn.resp_body)
    assert File.read!(Path.join(root, "ideas/first.md")) == "# First"
  end

  test "creating over an existing document is 409 and leaves it intact", %{root: root} do
    fixture(root, "exists.md", "original")
    conn = call(:post, "/api/document/new", %{path: "exists.md"})
    assert conn.status == 409
    assert File.read!(Path.join(root, "exists.md")) == "original"
  end

  test "a document is renamed and answers with its new path", %{root: root} do
    fixture(root, "from.md", "x")
    conn = call(:post, "/api/document/rename", %{from: "from.md", to: "sub/to.md"})
    assert conn.status == 200
    assert %{"path" => "sub/to.md"} = Jason.decode!(conn.resp_body)
  end

  test "renaming onto an existing document is 409", %{root: root} do
    fixture(root, "a.md", "a")
    fixture(root, "b.md", "b")
    assert call(:post, "/api/document/rename", %{from: "a.md", to: "b.md"}).status == 409
  end

  test "a document is moved to the trash", %{root: root} do
    fixture(root, "gone.md", "x")
    conn = call(:post, "/api/document/trash", %{path: "gone.md"})
    assert conn.status == 200
    assert %{"trashed" => true} = Jason.decode!(conn.resp_body)
    refute File.exists?(Path.join(root, "gone.md"))
  end

  test "creating without a path is 400" do
    assert call(:post, "/api/document/new", %{contents: "x"}).status == 400
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

  describe "GET /api/search" do
    test "finds documents fuzzily", %{root: root} do
      fixture(root, "work/design-notes.md", "d")
      fixture(root, "other.md", "o")

      conn = call(:get, "/api/search?q=dsn")
      assert conn.status == 200
      assert %{"results" => [%{"path" => "work/design-notes.md"}]} = Jason.decode!(conn.resp_body)
    end

    test "a blank query lists documents rather than erroring", %{root: root} do
      fixture(root, "a.md", "a")

      conn = call(:get, "/api/search?q=")
      assert %{"results" => [%{"path" => "a.md"}]} = Jason.decode!(conn.resp_body)
    end

    test "clamps a nonsense limit", %{root: root} do
      for i <- 1..5, do: fixture(root, "n#{i}.md", "n")

      conn = call(:get, "/api/search?q=n&limit=banana")
      assert %{"results" => results} = Jason.decode!(conn.resp_body)
      assert length(results) == 5
    end
  end

  describe "GET /api/search/contents" do
    test "answers with the whole document, not with the matching line", %{root: root} do
      fixture(root, "notes.md", "intro\nthe needle\noutro\n")

      conn = call(:get, "/api/search/contents?q=needle")
      assert conn.status == 200

      assert %{"files" => [file], "truncated" => false, "query" => "needle"} =
               Jason.decode!(conn.resp_body)

      assert file["contents"] == "intro\nthe needle\noutro\n"
    end

    test "case sensitivity is off unless asked for", %{root: root} do
      fixture(root, "notes.md", "Needle")

      assert %{"files" => [_]} =
               Jason.decode!(call(:get, "/api/search/contents?q=needle").resp_body)

      assert %{"files" => []} =
               Jason.decode!(call(:get, "/api/search/contents?q=needle&case=1").resp_body)
    end

    test "a blank query answers empty rather than every document", %{root: root} do
      fixture(root, "a.md", "a")

      assert %{"files" => []} = Jason.decode!(call(:get, "/api/search/contents?q=").resp_body)
    end
  end

  describe "/api/session" do
    test "starts empty, then hands back what was saved" do
      assert %{"document" => nil, "draft" => nil} =
               Jason.decode!(call(:get, "/api/session").resp_body)

      conn =
        call(:post, "/api/session", %{
          document: "a.md",
          draft: %{path: "a.md", contents: "# Unsaved"}
        })

      assert conn.status == 200

      assert %{"document" => "a.md", "draft" => %{"contents" => "# Unsaved"}} =
               Jason.decode!(call(:get, "/api/session").resp_body)
    end

    test "rejects a value that does not fit" do
      conn = call(:post, "/api/session", %{view: "sideways"})
      assert conn.status == 422
    end
  end

  describe "/api/settings" do
    test "reports the settings, their file and whether the root is pinned" do
      conn = call(:get, "/api/settings")
      assert conn.status == 200

      assert %{"settings" => settings, "path" => path, "rootLocked" => true} =
               Jason.decode!(conn.resp_body)

      assert settings["theme"] == "system"
      assert String.ends_with?(path, "settings.json")
    end

    test "saves a setting" do
      conn = call(:post, "/api/settings", %{theme: "dark", editorFontSize: 15})
      assert conn.status == 200

      assert %{"settings" => %{"theme" => "dark", "editorFontSize" => 15}} =
               Jason.decode!(conn.resp_body)
    end

    test "rejects a value that does not fit" do
      conn = call(:post, "/api/settings", %{editorFontSize: 400})
      assert conn.status == 422
      assert %{"error" => "invalid value for \"editorFontSize\""} = Jason.decode!(conn.resp_body)
    end

    test "refuses to change a root pinned by MARKDN_ROOT", %{root: root} do
      conn = call(:post, "/api/settings", %{root: root})
      assert conn.status == 409
    end

    test "accepts a root once nothing is pinning it", %{root: root} do
      notes = Path.join(root, "notes")
      File.mkdir_p!(notes)
      unpin_root()

      conn = call(:post, "/api/settings", %{root: notes})
      assert conn.status == 200
      assert %{"root" => ^notes, "rootLocked" => false} = Jason.decode!(conn.resp_body)
    end
  end
end
