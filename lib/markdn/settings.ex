defmodule Markdn.Settings do
  @moduledoc """
  User settings, persisted as JSON in a settings directory outside the app bundle.

  MarkDN ships as a signed-nothing desktop app with no preferences window in the
  OS sense, so settings live in one small file the user can also edit by hand:

      macOS  ~/Library/Application Support/app.markdn.desktop/settings.json
      other  $XDG_CONFIG_HOME/markdn/settings.json (or ~/.config/markdn)

  `MARKDN_CONFIG_DIR` overrides the directory, which is what the tests use.
  The macOS location is deliberately the one the Homebrew cask's `zap` already
  trashes, so uninstalling still leaves nothing behind.

  ## Why the file is cached

  `Markdn.Documents.root/0` is called for every path check and once per listed
  entry, so reading and decoding JSON inside it would put a file read in the
  middle of every directory listing. The decoded map is cached in
  `:persistent_term` — read-optimised, and written only when settings change or
  the config directory does (which, in practice, is once per test).

  Unknown keys and out-of-range values are dropped rather than rejected: a
  hand-edited file with a typo in it should still boot the app with the rest of
  its settings intact.
  """

  @defaults %{
    # nil means "the user's home directory", resolved by Markdn.Documents.root/0.
    "root" => nil,
    "theme" => "system",
    "defaultView" => "split",
    "editorFontSize" => 13,
    "showHiddenFiles" => false,
    # Pixels per second for the auto-scroll teleprompter.
    "autoScrollSpeed" => 40
  }

  @themes ~w(system light dark)
  @views ~w(split editor preview)
  @font_sizes 10..24
  @speeds 5..400

  @cache_key {__MODULE__, :cache}

  @doc "Directory holding `settings.json`."
  @spec dir() :: String.t()
  def dir do
    case System.get_env("MARKDN_CONFIG_DIR") do
      nil -> default_dir()
      dir -> Path.expand(dir)
    end
  end

  defp default_dir do
    case :os.type() do
      {:unix, :darwin} ->
        Path.join(System.user_home!(), "Library/Application Support/app.markdn.desktop")

      _ ->
        base = System.get_env("XDG_CONFIG_HOME") || Path.join(System.user_home!(), ".config")
        Path.join(base, "markdn")
    end
  end

  @doc "Absolute path of the settings file. Shown in the UI so it can be found."
  @spec path() :: String.t()
  def path, do: Path.join(dir(), "settings.json")

  @doc "Every setting, defaults filled in for anything missing or invalid."
  @spec all() :: map()
  def all do
    path = path()

    case :persistent_term.get(@cache_key, nil) do
      %{path: ^path, settings: settings} -> settings
      _ -> load(path)
    end
  end

  @doc "One setting by key. Unknown keys raise — they are a typo, not user input."
  @spec get(String.t()) :: term()
  def get(key), do: Map.fetch!(all(), key)

  @doc """
  Merges `attrs` into the stored settings and writes them back.

  Returns `{:ok, settings}`, or `{:error, {:invalid, key}}` for a value that is
  the wrong shape — a root that is not a directory, a font size outside the
  supported range. Unknown keys are ignored.
  """
  @spec put(map()) :: {:ok, map()} | {:error, {:invalid, String.t()} | atom()}
  def put(attrs) when is_map(attrs) do
    with {:ok, changes} <- validate(attrs) do
      settings = Map.merge(all(), changes)

      with :ok <- write(settings) do
        {:ok, settings}
      end
    end
  end

  def put(_), do: {:error, :invalid_settings}

  @doc "Drops the cache. Only needed when the file changes underneath the app."
  @spec refresh() :: map()
  def refresh, do: load(path())

  @doc "The default value of every setting, for a UI that offers a reset."
  @spec defaults() :: map()
  def defaults, do: @defaults

  defp load(path) do
    settings =
      case File.read(path) do
        {:ok, body} -> body |> decode() |> sanitize()
        {:error, _} -> @defaults
      end

    :persistent_term.put(@cache_key, %{path: path, settings: settings})
    settings
  end

  defp decode(body) do
    case Jason.decode(body) do
      {:ok, %{} = map} -> map
      # A corrupt file falls back to defaults rather than crashing the boot: the
      # app is more useful with default settings than not running at all.
      _ -> %{}
    end
  end

  # Reading is lenient (drop what does not fit), writing is strict (report it).
  defp sanitize(map) do
    Enum.reduce(@defaults, @defaults, fn {key, default}, acc ->
      case Map.fetch(map, key) do
        {:ok, value} ->
          case cast(key, value) do
            {:ok, cast} -> Map.put(acc, key, cast)
            :error -> Map.put(acc, key, default)
          end

        :error ->
          acc
      end
    end)
  end

  defp validate(attrs) do
    attrs
    |> Map.take(Map.keys(@defaults))
    |> Enum.reduce_while({:ok, %{}}, fn {key, value}, {:ok, acc} ->
      case cast(key, value) do
        {:ok, cast} -> {:cont, {:ok, Map.put(acc, key, cast)}}
        :error -> {:halt, {:error, {:invalid, key}}}
      end
    end)
  end

  # A root only counts if it exists now — a typo'd path would otherwise silently
  # confine the whole app to a directory that is never there.
  defp cast("root", nil), do: {:ok, nil}
  defp cast("root", ""), do: {:ok, nil}

  defp cast("root", value) when is_binary(value) do
    expanded = Path.expand(value)
    if File.dir?(expanded), do: {:ok, expanded}, else: :error
  end

  defp cast("theme", value) when value in @themes, do: {:ok, value}
  defp cast("defaultView", value) when value in @views, do: {:ok, value}
  defp cast("showHiddenFiles", value) when is_boolean(value), do: {:ok, value}

  defp cast("editorFontSize", value) when is_integer(value) do
    if value in @font_sizes, do: {:ok, value}, else: :error
  end

  defp cast("autoScrollSpeed", value) when is_number(value) do
    speed = round(value)
    if speed in @speeds, do: {:ok, speed}, else: :error
  end

  defp cast(_key, _value), do: :error

  defp write(settings) do
    with :ok <- File.mkdir_p(dir()),
         :ok <- File.write(path(), Jason.encode!(settings, pretty: true) <> "\n") do
      :persistent_term.put(@cache_key, %{path: path(), settings: settings})
      :ok
    end
  end
end
