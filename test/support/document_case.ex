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

    # Settings are read on every listing (hidden files) and every root lookup, so
    # they get a sandbox too — otherwise a test run would read, and `put/1` would
    # overwrite, the developer's real settings file.
    config = Path.join(sandbox, "config")
    System.put_env("MARKDN_CONFIG_DIR", config)
    Markdn.Settings.refresh()

    on_exit(fn ->
      File.rm_rf!(sandbox)
      System.delete_env("MARKDN_CONFIG_DIR")
      Markdn.Settings.refresh()

      if previous,
        do: Application.put_env(:markdn, :root, previous),
        else: Application.delete_env(:markdn, :root)
    end)

    {:ok, root: sandbox, config_dir: config}
  end

  @doc """
  Unpins `MARKDN_ROOT` for a test that needs the settings root to take effect.

  The case pins the root through application env so file operations stay in the
  sandbox; anything exercising the settings root has to lift that first.
  """
  @spec unpin_root() :: :ok
  def unpin_root do
    Application.delete_env(:markdn, :root)
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
