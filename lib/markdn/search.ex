defmodule Markdn.Search do
  @moduledoc """
  Literal text search across every markdown document under the root.

  This is what the multibuffer is built on, so it answers with the *whole*
  contents of each matching file rather than with the matching lines. The
  multibuffer edits what it finds and writes the file back; the parts it is not
  showing are exactly the parts it must not lose. Shipping fragments would mean a
  second read before anything could be saved, and a window in which the file
  changed underneath the edit.

  Matching is literal — never a regular expression — because the client re-finds
  the same matches in the text it was handed, to underline them and to replace
  them. Two engines agreeing on "contains this string" is guaranteed in a way
  that two dialects of regex are not, and a hit the client cannot find again is a
  file that appears in the results with nothing in it.
  """

  alias Markdn.Documents

  # A file this large is not a document someone is searching prose in, and the
  # multibuffer holds every result in memory at once.
  @max_bytes 1_000_000

  @default_limit 40
  @max_limit 200

  @doc """
  Finds documents containing `query`.

  Returns `%{files: [%{path:, name:, contents:}], truncated: boolean}`, ordered by
  path so the multibuffer's groups sit in tree order. `truncated` says the limit
  cut the results short, so the interface can say so rather than imply the search
  was exhaustive.

  A blank query matches nothing: it is the state of the field before anything is
  typed, and every document in a home directory is not a useful answer to it.

  ## Options

    * `:limit` - files to return (default #{@default_limit}, capped at #{@max_limit})
    * `:case_sensitive` - match case exactly (default `false`)
  """
  @spec run(String.t(), keyword()) :: %{files: [map()], truncated: boolean()}
  def run(query, opts \\ []) when is_binary(query) do
    case String.trim(query) do
      "" -> %{files: [], truncated: false}
      trimmed -> collect(trimmed, opts)
    end
  end

  defp collect(query, opts) do
    limit = opts |> Keyword.get(:limit, @default_limit) |> max(1) |> min(@max_limit)
    case_sensitive = Keyword.get(opts, :case_sensitive, false)
    needle = if case_sensitive, do: query, else: String.downcase(query)

    {found, _count, truncated} =
      Documents.walk()
      |> Enum.sort_by(& &1.path)
      |> Enum.reduce_while({[], 0, false}, fn
        # Stopping at the limit rather than collecting everything and taking the
        # first N: the work here is a file read each, not a list cell.
        _document, {found, count, _} when count == limit ->
          {:halt, {found, count, true}}

        document, {found, count, _} ->
          case match(document, needle, case_sensitive) do
            {:ok, hit} -> {:cont, {[hit | found], count + 1, false}}
            :skip -> {:cont, {found, count, false}}
          end
      end)

    %{files: Enum.reverse(found), truncated: truncated}
  end

  defp match(document, needle, case_sensitive) do
    with {:ok, contents} <- read(document.path),
         true <- contains?(contents, needle, case_sensitive) do
      {:ok, %{path: document.path, name: document.name, contents: contents}}
    else
      _ -> :skip
    end
  end

  # Size is checked before reading, not after: the point is not to pull a
  # gigabyte into memory to discover it was a gigabyte.
  defp read(path) do
    with {:ok, abs} <- Documents.safe_path(path),
         {:ok, %File.Stat{size: size}} when size <= @max_bytes <- File.stat(abs) do
      File.read(abs)
    else
      _ -> :skip
    end
  end

  defp contains?(contents, needle, true), do: String.contains?(contents, needle)

  defp contains?(contents, needle, false),
    do: contents |> String.downcase() |> String.contains?(needle)
end
