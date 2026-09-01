defmodule Markdn.FuzzyTest do
  use ExUnit.Case, async: true

  alias Markdn.Fuzzy

  describe "match/2" do
    test "matches a subsequence, not just a substring" do
      assert {:ok, _score, _positions} = Fuzzy.match("docs/design-notes.md", "dsn")
    end

    test "reports where the query landed" do
      assert {:ok, _score, [0, 1, 2]} = Fuzzy.match("readme.md", "rea")
    end

    test "is case-insensitive in both directions" do
      assert {:ok, _, _} = Fuzzy.match("CHANGELOG.md", "chg")
      assert {:ok, _, _} = Fuzzy.match("changelog.md", "CHG")
    end

    test "refuses characters that are out of order" do
      assert :nomatch = Fuzzy.match("readme.md", "mr")
    end

    test "refuses a query with characters the target does not have" do
      assert :nomatch = Fuzzy.match("readme.md", "readmex")
    end

    test "an empty query matches anything, neutrally" do
      assert {:ok, 0, []} = Fuzzy.match("anything.md", "")
    end
  end

  describe "score/2 ranking" do
    test "a contiguous run beats the same characters scattered" do
      assert Fuzzy.score("release-notes.md", "rel") > Fuzzy.score("random-eel.md", "rel")
    end

    test "word starts beat characters in the middle of a word" do
      assert Fuzzy.score("design-notes.md", "dn") > Fuzzy.score("bandana.md", "dn")
    end

    test "a match at the very start beats one further in" do
      assert Fuzzy.score("notes.md", "no") > Fuzzy.score("the-notes.md", "no")
    end

    test "a shorter path scores above a longer one matching the same way" do
      assert Fuzzy.score("api.md", "api") > Fuzzy.score("a/deep/nested/tree/api.md", "api")
    end
  end
end
