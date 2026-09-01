defmodule Markdn.MCP.Handler do
  @moduledoc """
  Model Context Protocol server exposing MarkDN's documents as tools.

  Speaks JSON-RPC 2.0 over the Streamable HTTP transport: the request arrives as
  the `POST /mcp` body and the response *is* the response body. Notifications
  (requests with no `id`) get no reply at all, per the spec — returning a body
  for one makes strict clients error.

  Every tool goes through `Markdn.Documents`, so the same root confinement that
  guards the UI also guards anything an agent asks for.
  """

  alias Markdn.Documents

  @protocol_version "2025-06-18"
  @server_info %{name: "markdn", version: "0.1.0"}

  @doc """
  Handles one decoded JSON-RPC message.

  Returns `{:reply, response}` for requests, or `:noreply` for notifications.
  """
  @spec handle(map()) :: {:reply, map()} | :noreply
  def handle(%{"method" => method} = message) do
    id = Map.get(message, "id")
    params = Map.get(message, "params") || %{}

    case {id, dispatch(method, params)} do
      # A notification: no id, so no response may be sent.
      {nil, _} -> :noreply
      {id, {:ok, result}} -> {:reply, %{jsonrpc: "2.0", id: id, result: result}}
      {id, {:error, code, msg}} -> {:reply, error(id, code, msg)}
    end
  end

  def handle(_), do: {:reply, error(nil, -32_600, "invalid request")}

  defp dispatch("initialize", _params) do
    {:ok,
     %{
       protocolVersion: @protocol_version,
       serverInfo: @server_info,
       capabilities: %{tools: %{}}
     }}
  end

  defp dispatch("ping", _params), do: {:ok, %{}}
  defp dispatch("notifications/initialized", _params), do: {:ok, %{}}
  defp dispatch("tools/list", _params), do: {:ok, %{tools: tools()}}

  defp dispatch("tools/call", %{"name" => name} = params) do
    call_tool(name, Map.get(params, "arguments") || %{})
  end

  defp dispatch(method, _params), do: {:error, -32_601, "method not found: #{method}"}

  # --- Tools ---------------------------------------------------------------

  defp tools do
    [
      %{
        name: "list_documents",
        description:
          "List markdown documents and directories one level under a path, relative to the MarkDN root.",
        inputSchema: %{
          type: "object",
          properties: %{
            path: %{
              type: "string",
              description: "Directory relative to the root. Defaults to the root itself."
            }
          }
        }
      },
      %{
        name: "read_document",
        description: "Read the full contents of a markdown or MDX document.",
        inputSchema: %{
          type: "object",
          properties: %{
            path: %{type: "string", description: "Document path relative to the root."}
          },
          required: ["path"]
        }
      },
      %{
        name: "write_document",
        description:
          "Create or overwrite a markdown or MDX document. Parent directories are created as needed.",
        inputSchema: %{
          type: "object",
          properties: %{
            path: %{type: "string", description: "Document path relative to the root."},
            contents: %{type: "string", description: "Full new contents of the document."}
          },
          required: ["path", "contents"]
        }
      },
      %{
        name: "list_components",
        description:
          "List the MDX components the MarkDN renderer will render, with their props. Use before writing MDX so the document only references components that exist.",
        inputSchema: %{type: "object", properties: %{}}
      }
    ]
  end

  defp call_tool("list_documents", args) do
    args |> Map.get("path", ".") |> Documents.list() |> tool_result(&format_listing/1)
  end

  defp call_tool("read_document", %{"path" => path}) do
    path |> Documents.read() |> tool_result(& &1)
  end

  defp call_tool("write_document", %{"path" => path, "contents" => contents}) do
    case Documents.write(path, contents) do
      :ok ->
        # Any window with this document open re-reads it, so an agent's write does
        # not sit invisibly under the user's editor.
        Markdn.notify_saved(path)
        {:ok, text_content("wrote #{path}")}

      {:error, reason} ->
        {:ok, error_content(reason)}
    end
  end

  defp call_tool("list_components", _args) do
    {:ok, text_content(Jason.encode!(Markdn.MCP.Components.all(), pretty: true))}
  end

  defp call_tool(name, _args), do: {:error, -32_602, "unknown tool: #{name}"}

  # A failing tool is reported as a result with `isError: true`, not as a JSON-RPC
  # error. Protocol-level errors mean the call itself was malformed; a file that
  # does not exist is a normal outcome the model should see and react to.
  defp tool_result({:ok, value}, formatter), do: {:ok, text_content(formatter.(value))}
  defp tool_result({:error, reason}, _formatter), do: {:ok, error_content(reason)}

  defp format_listing(entries) do
    Jason.encode!(entries, pretty: true)
  end

  defp text_content(text) do
    %{content: [%{type: "text", text: text}], isError: false}
  end

  defp error_content(reason) do
    %{content: [%{type: "text", text: "error: #{describe(reason)}"}], isError: true}
  end

  defp describe(:outside_root), do: "path is outside the MarkDN root"
  defp describe(:unsupported_extension), do: "not a markdown document (.md, .markdown, .mdx)"
  defp describe(:enoent), do: "no such file or directory"
  defp describe(:eacces), do: "permission denied"
  defp describe(other), do: to_string(other)

  defp error(id, code, message) do
    %{jsonrpc: "2.0", id: id, error: %{code: code, message: message}}
  end
end
