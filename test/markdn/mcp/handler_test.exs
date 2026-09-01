defmodule Markdn.MCP.HandlerTest do
  use Markdn.DocumentCase, async: false

  alias Markdn.MCP.Handler

  defp request(method, params \\ %{}, id \\ 1) do
    Handler.handle(%{"jsonrpc" => "2.0", "id" => id, "method" => method, "params" => params})
  end

  test "initialize advertises the tools capability" do
    assert {:reply, %{result: result}} = request("initialize")
    assert result.serverInfo.name == "markdn"
    assert result.capabilities.tools == %{}
  end

  test "a notification gets no reply at all" do
    # No "id" makes it a notification; replying to one breaks strict clients.
    assert :noreply =
             Handler.handle(%{"jsonrpc" => "2.0", "method" => "notifications/initialized"})
  end

  test "tools/list names every tool" do
    assert {:reply, %{result: %{tools: tools}}} = request("tools/list")
    names = Enum.map(tools, & &1.name)

    assert Enum.sort(names) ==
             ~w(list_components list_documents read_document write_document)
  end

  test "unknown method is a JSON-RPC error" do
    assert {:reply, %{error: %{code: -32_601}}} = request("nope")
  end

  describe "tools/call" do
    test "writes and reads a document back" do
      assert {:reply, %{result: %{isError: false}}} =
               request("tools/call", %{
                 "name" => "write_document",
                 "arguments" => %{"path" => "note.md", "contents" => "# Hi"}
               })

      assert {:reply, %{result: %{content: [%{text: "# Hi"}], isError: false}}} =
               request("tools/call", %{
                 "name" => "read_document",
                 "arguments" => %{"path" => "note.md"}
               })
    end

    test "a path outside the root is a tool error, not a protocol error" do
      # The model should see this and correct itself, so it comes back as a
      # successful call carrying isError, not as a JSON-RPC error.
      assert {:reply, %{result: %{isError: true, content: [%{text: text}]}}} =
               request("tools/call", %{
                 "name" => "read_document",
                 "arguments" => %{"path" => "../../etc/passwd"}
               })

      assert text =~ "outside the MarkDN root"
    end

    test "list_components matches the renderer registry" do
      assert {:reply, %{result: %{content: [%{text: json}]}}} =
               request("tools/call", %{"name" => "list_components", "arguments" => %{}})

      names = json |> Jason.decode!() |> Enum.map(& &1["name"])
      assert "Alert" in names
      assert "Tabs" in names
    end

    test "unknown tool is a protocol error" do
      assert {:reply, %{error: %{code: -32_602}}} =
               request("tools/call", %{"name" => "drop_tables", "arguments" => %{}})
    end
  end
end
