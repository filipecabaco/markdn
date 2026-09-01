defmodule Markdn.MCP.Components do
  @moduledoc """
  The MDX component registry, described for MCP clients.

  This is the server-side mirror of `assets/src/components/mdx/registry.tsx`. An
  agent writing MDX needs to know which components exist and what props they take,
  otherwise it emits `<Accordion>` and the renderer shows an unknown-component
  placeholder. `test/markdn/mcp/components_test.exs` asserts the two stay in step.
  """

  @components [
    %{
      name: "Alert",
      description: "Highlighted message box.",
      props: %{
        type: %{type: "enum", values: ~w(info warning error success), required: true},
        title: %{type: "string", required: false}
      }
    },
    %{
      name: "Callout",
      description: "Inline aside for tips and asides. Renders its markdown children.",
      props: %{
        type: %{type: "enum", values: ~w(tip note important), required: true},
        title: %{type: "string", required: false}
      }
    },
    %{
      name: "Card",
      description: "Titled container for grouped content.",
      props: %{
        title: %{type: "string", required: true},
        subtitle: %{type: "string", required: false}
      }
    },
    %{
      name: "Tabs",
      description: "Tabbed panels. Children must be <Tab> elements.",
      props: %{defaultValue: %{type: "string", required: false}}
    },
    %{
      name: "Tab",
      description: "One panel inside <Tabs>.",
      props: %{
        value: %{type: "string", required: true},
        label: %{type: "string", required: false}
      }
    }
  ]

  @doc "Every component the renderer knows, with its props."
  @spec all() :: [map()]
  def all, do: @components

  @doc "Just the component names."
  @spec names() :: [String.t()]
  def names, do: Enum.map(@components, & &1.name)
end
