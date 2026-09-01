defmodule Markdn.Fuzzy do
  @moduledoc """
  Subsequence matching with positional scoring, for the file and command palette.

  A query matches when its characters appear in the target in order, not
  necessarily adjacently: `dsn` finds `docs/design-notes.md`. Ranking is what
  makes that useful rather than noisy, so `match/2` also returns a score built
  from *where* the characters landed — runs and word starts are what a person
  means when they type an abbreviation — and the matched indices, so the palette
  can show which characters were hit.

  Matching is greedy left to right. That is not always the highest-scoring
  alignment, but it is linear, and the boundary bonuses below already pull the
  intended candidate to the top for the abbreviations people actually type.
  """

  # Characters after which the next character starts a new "word": path segments,
  # kebab/snake parts, extensions.
  @separators ~c"/-_. "

  # Both matched at the same index as the previous one: a run. Weighted highest
  # because a run is a literal substring, which is the strongest signal of intent.
  @consecutive 10
  @boundary 8
  @first_char 9
  # Each skipped target character. Keeps a short path ahead of a long one that
  # matches equally well, without ever vetoing a real match.
  @gap -1

  @doc """
  Scores `query` against `target`.

  Returns `{:ok, score, matched_indices}` or `:nomatch`. Both sides are compared
  case-insensitively; an empty query matches everything with a score of 0.

  Indices count codepoints from the start of `target`.
  """
  @spec match(String.t(), String.t()) :: {:ok, integer(), [non_neg_integer()]} | :nomatch
  def match(target, query) when is_binary(target) and is_binary(query) do
    do_match(
      target |> String.downcase() |> to_charlist(),
      query |> String.downcase() |> to_charlist(),
      0,
      -2,
      nil,
      0,
      []
    )
  end

  @doc """
  Convenience wrapper returning only the score.

  `nil` means no match, which sorts out rather than to the bottom.
  """
  @spec score(String.t(), String.t()) :: integer() | nil
  def score(target, query) do
    case match(target, query) do
      {:ok, score, _positions} -> score
      :nomatch -> nil
    end
  end

  # Query exhausted: everything matched.
  defp do_match(_target, [], _index, _last_hit, _prev_char, score, hits) do
    {:ok, score, Enum.reverse(hits)}
  end

  # Target exhausted with query characters left over.
  defp do_match([], _query, _index, _last_hit, _prev_char, _score, _hits), do: :nomatch

  defp do_match([char | rest], [char | query_rest], index, last_hit, prev_char, score, hits) do
    bonus =
      cond do
        last_hit == index - 1 -> @consecutive
        index == 0 -> @first_char
        prev_char in @separators -> @boundary
        true -> 0
      end

    do_match(rest, query_rest, index + 1, index, char, score + 1 + bonus, [index | hits])
  end

  defp do_match([char | rest], query, index, last_hit, _prev_char, score, hits) do
    do_match(rest, query, index + 1, last_hit, char, score + @gap, hits)
  end
end
