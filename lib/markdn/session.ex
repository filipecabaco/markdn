defmodule Markdn.Session do
  @moduledoc """
  Where the reader was: the open document, the view, and any unsaved edits.

  The window loses all of it whenever its page is reloaded — on iPhone and iPad
  that is iOS reclaiming a suspended app's web content, or ending the app, and on
  the desktop it is a restart. Browser storage cannot carry it across a launch,
  because the window's origin changes port every time, so it is kept here, in
  `session.json` beside the settings, and handed back when the window loads.

  Unlike `Markdn.Settings` this is not a preference and is not cached: it is read
  once per window and written as the reader moves. Writes go through a temporary
  file and a rename, since the moment that matters most is the app being killed
  mid-write, and a torn file would lose exactly what this is here to keep.
  """

  alias Markdn.Settings

  @empty %{"document" => nil, "view" => nil, "draft" => nil}
  @views ~w(split editor preview)

  @doc "Absolute path of the session file."
  @spec path() :: String.t()
  def path, do: Path.join(Settings.dir(), "session.json")

  @doc "The stored session, with anything missing or malformed left empty."
  @spec get() :: map()
  def get do
    with {:ok, body} <- File.read(path()),
         {:ok, %{} = map} <- Jason.decode(body) do
      Enum.reduce(@empty, @empty, fn {key, _}, acc ->
        case cast(key, Map.get(map, key)) do
          {:ok, value} -> Map.put(acc, key, value)
          :error -> acc
        end
      end)
    else
      _ -> @empty
    end
  end

  @doc """
  Merges `attrs` into the session and writes it back.

  `{:error, {:invalid, key}}` for a value of the wrong shape; unknown keys are
  ignored. A `nil` clears its key: no document open, no unsaved draft.
  """
  @spec put(map()) :: {:ok, map()} | {:error, {:invalid, String.t()} | atom()}
  def put(attrs) when is_map(attrs) do
    changes =
      attrs
      |> Map.take(Map.keys(@empty))
      |> Enum.reduce_while({:ok, %{}}, fn {key, value}, {:ok, acc} ->
        case cast(key, value) do
          {:ok, cast} -> {:cont, {:ok, Map.put(acc, key, cast)}}
          :error -> {:halt, {:error, {:invalid, key}}}
        end
      end)

    with {:ok, changes} <- changes do
      session = Map.merge(get(), changes)

      with :ok <- write(session) do
        {:ok, session}
      end
    end
  end

  def put(_), do: {:error, :invalid_session}

  defp cast(_key, nil), do: {:ok, nil}
  defp cast("document", path) when is_binary(path) and path != "", do: {:ok, path}
  defp cast("view", view) when view in @views, do: {:ok, view}

  # A draft of the untitled buffer has no path; it is still worth keeping.
  defp cast("draft", %{"contents" => contents} = draft) when is_binary(contents) do
    case Map.get(draft, "path") do
      path when is_binary(path) or is_nil(path) ->
        {:ok, %{"path" => path, "contents" => contents}}

      _ ->
        :error
    end
  end

  defp cast(_key, _value), do: :error

  defp write(session) do
    target = path()
    staged = target <> ".#{System.unique_integer([:positive])}.tmp"

    with :ok <- File.mkdir_p(Path.dirname(target)),
         :ok <- File.write(staged, Jason.encode!(session) <> "\n"),
         :ok <- File.rename(staged, target) do
      :ok
    else
      error ->
        File.rm(staged)
        error
    end
  end
end
