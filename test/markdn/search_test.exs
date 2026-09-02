defmodule Markdn.SearchTest do
  use Markdn.DocumentCase, async: false

  alias Markdn.Search

  describe "run/2" do
    test "returns whole documents containing the query", %{root: root} do
      fixture(root, "notes/a.md", "# Alpha\n\nthe needle is here\n")
      fixture(root, "notes/b.md", "nothing to see\n")

      assert %{files: [file], truncated: false} = Search.run("needle")
      assert file.path == "notes/a.md"
      assert file.name == "a.md"
      # The multibuffer writes the file back, so it needs the lines around the
      # hit as much as the hit itself.
      assert file.contents == "# Alpha\n\nthe needle is here\n"
    end

    test "is case-insensitive by default", %{root: root} do
      fixture(root, "a.md", "Needle")

      assert %{files: [_]} = Search.run("needle")
      assert %{files: []} = Search.run("needle", case_sensitive: true)
      assert %{files: [_]} = Search.run("Needle", case_sensitive: true)
    end

    test "orders results by path", %{root: root} do
      fixture(root, "z.md", "hit")
      fixture(root, "a.md", "hit")
      fixture(root, "m/n.md", "hit")

      assert %{files: files} = Search.run("hit")
      assert ["a.md", "m/n.md", "z.md"] = Enum.map(files, & &1.path)
    end

    test "matches nothing for a blank query", %{root: root} do
      fixture(root, "a.md", "content")

      assert %{files: [], truncated: false} = Search.run("")
      assert %{files: [], truncated: false} = Search.run("   ")
    end

    test "reports truncation when the limit cuts results short", %{root: root} do
      for index <- 1..4, do: fixture(root, "doc#{index}.md", "hit")

      assert %{files: files, truncated: true} = Search.run("hit", limit: 2)
      assert length(files) == 2
    end

    test "does not report truncation when everything fitted", %{root: root} do
      fixture(root, "a.md", "hit")

      assert %{truncated: false} = Search.run("hit", limit: 2)
    end

    test "ignores non-markdown files", %{root: root} do
      fixture(root, "secrets.txt", "needle")
      fixture(root, "script.sh", "needle")

      assert %{files: []} = Search.run("needle")
    end
  end
end
