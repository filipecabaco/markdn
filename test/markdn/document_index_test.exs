defmodule Markdn.DocumentIndexTest do
  # The index is one named process shared by the whole app, so these cannot run
  # alongside other tests that walk.
  use Markdn.DocumentCase, async: false

  alias Markdn.Documents

  defp paths, do: Documents.walk() |> Enum.map(& &1.path) |> Enum.sort()

  describe "the cached list" do
    test "is reused: a file written behind the app's back is not walked again",
         %{root: root} do
      fixture(root, "first.md", "1")
      assert ["first.md"] = paths()

      # Written straight to disk, not through Documents — only a walk finds it,
      # and the list is fresh, so no walk runs.
      fixture(root, "second.md", "2")
      assert ["first.md"] = paths()
    end

    test "is refreshed in the background once stale, answering from memory meanwhile",
         %{root: root} do
      Application.put_env(:markdn, :index_refresh_after_ms, 0)
      on_exit(fn -> Application.delete_env(:markdn, :index_refresh_after_ms) end)

      fixture(root, "first.md", "1")
      assert ["first.md"] = paths()

      fixture(root, "second.md", "2")
      assert eventually(fn -> paths() == ["first.md", "second.md"] end)
    end

    test "shares one walk between concurrent callers", %{root: root} do
      for i <- 1..20, do: fixture(root, "note-#{i}.md", "n")

      results =
        1..10
        |> Task.async_stream(fn _ -> paths() end, max_concurrency: 10)
        |> Enum.map(fn {:ok, result} -> result end)

      assert [only] = Enum.uniq(results)
      assert length(only) == 20
    end
  end

  describe "changes the app makes" do
    test "a created document is listed without another walk", %{root: root} do
      fixture(root, "first.md", "1")
      assert ["first.md"] = paths()

      assert {:ok, "notes/new.md"} = Documents.create("notes/new.md", "n")
      assert ["first.md", "notes/new.md"] = paths()
    end

    test "a saved document is listed, and moves to the top of the recent list",
         %{root: root} do
      old = fixture(root, "old.md", "o")
      File.touch!(old, System.os_time(:second) - 120)
      fixture(root, "other.md", "x") |> File.touch!(System.os_time(:second) - 60)
      assert [%{path: "other.md"}, %{path: "old.md"}] = Documents.search("")

      assert :ok = Documents.write("saved.md", "s")
      assert [%{path: "saved.md"} | _] = Documents.search("")
    end

    test "a renamed document is listed under its new name only", %{root: root} do
      fixture(root, "draft.md", "d")
      assert ["draft.md"] = paths()

      assert {:ok, "final/post.md"} = Documents.rename("draft.md", "final/post.md")
      assert ["final/post.md"] = paths()
    end

    test "a trashed document is dropped", %{root: root} do
      fixture(root, "keep.md", "k")
      fixture(root, "old.md", "o")
      assert ["keep.md", "old.md"] = paths()

      assert :ok = Documents.trash("old.md")
      assert ["keep.md"] = paths()
    end

    test "a document under a hidden directory stays out, as a walk would leave it",
         %{root: root} do
      fixture(root, "visible.md", "v")
      assert ["visible.md"] = paths()

      assert :ok = Documents.write(".private/secret.md", "s")
      assert ["visible.md"] = paths()
    end
  end

  describe "the key" do
    test "showing hidden files is a different list, walked afresh", %{root: root} do
      fixture(root, ".notes/hidden.md", "h")
      fixture(root, "visible.md", "v")
      assert ["visible.md"] = paths()

      assert {:ok, _} = Markdn.Settings.put(%{"showHiddenFiles" => true})
      assert [".notes/hidden.md", "visible.md"] = paths()
    end
  end

  defp eventually(check, attempts \\ 50) do
    cond do
      check.() ->
        true

      attempts == 0 ->
        false

      true ->
        Process.sleep(20)
        eventually(check, attempts - 1)
    end
  end
end
