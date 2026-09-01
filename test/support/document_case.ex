defmodule Markdn.DocumentCase do
  @moduledoc """
  Points the document root at a per-test sandbox directory.

  Without this, every test that writes a document would write into the developer's
  real home directory, which is what `Markdn.Documents.root/0` falls back to.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
      import Markdn.DocumentCase
    end
  end

  setup do
    sandbox = Path.join(System.tmp_dir!(), "markdn-test-#{System.unique_integer([:positive])}")
    File.mkdir_p!(sandbox)
    previous = Application.get_env(:markdn, :root)
    Application.put_env(:markdn, :root, sandbox)

    on_exit(fn ->
      File.rm_rf!(sandbox)

      if previous,
        do: Application.put_env(:markdn, :root, previous),
        else: Application.delete_env(:markdn, :root)
    end)

    {:ok, root: sandbox}
  end

  @doc "Writes a fixture document inside the sandbox root."
  @spec fixture(String.t(), String.t(), String.t()) :: String.t()
  def fixture(root, path, contents) do
    full = Path.join(root, path)
    File.mkdir_p!(Path.dirname(full))
    File.write!(full, contents)
    full
  end
end
