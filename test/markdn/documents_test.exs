defmodule Markdn.DocumentsTest do
  use Markdn.DocumentCase, async: false

  alias Markdn.Documents

  describe "safe_path/1" do
    test "accepts a path inside the root", %{root: root} do
      assert {:ok, path} = Documents.safe_path("notes.md")
      assert path == Path.join(root, "notes.md")
    end

    test "rejects traversal out of the root" do
      assert {:error, :outside_root} = Documents.safe_path("../../../etc/passwd")
      assert {:error, :outside_root} = Documents.safe_path("/etc/passwd")
    end

    test "rejects a sibling directory sharing a string prefix", %{root: root} do
      # "<root>-evil" has "<root>" as a string prefix but is a different directory,
      # so a naive String.starts_with? check would wrongly allow it.
      assert {:error, :outside_root} = Documents.safe_path(root <> "-evil/secret.md")
    end
  end

  describe "read/1 and write/2" do
    test "round-trips a document" do
      assert :ok = Documents.write("notes/hello.md", "# Hello")
      assert {:ok, "# Hello"} = Documents.read("notes/hello.md")
    end

    test "refuses non-markdown extensions" do
      assert {:error, :unsupported_extension} = Documents.write("evil.sh", "rm -rf /")
      assert {:error, :unsupported_extension} = Documents.read("id_rsa")
    end

    test "reports a missing file" do
      assert {:error, :enoent} = Documents.read("nope.md")
    end
  end

  describe "read_image/1" do
    test "reads a relative image", %{root: root} do
      fixture(root, "assets/a.svg", "<svg/>")
      assert {:ok, "image/svg+xml", "<svg/>"} = Documents.read_image("assets/a.svg")
    end

    test "treats a leading slash as the root, the way documents are authored", %{root: root} do
      fixture(root, "pic.png", "bytes")
      assert {:ok, "image/png", "bytes"} = Documents.read_image("/pic.png")
    end

    test "still accepts a real absolute path inside the root", %{root: root} do
      fixture(root, "pic.png", "bytes")
      assert {:ok, "image/png", "bytes"} = Documents.read_image(Path.join(root, "pic.png"))
    end

    test "refuses an absolute path outside the root" do
      assert {:error, :outside_root} = Documents.read_image("/etc/hosts.png")
    end

    test "refuses traversal" do
      assert {:error, :outside_root} = Documents.read_image("../../secret.png")
    end

    test "refuses a non-image, so this is not a general file read" do
      assert {:error, :unsupported_extension} = Documents.read_image("notes.md")
      assert {:error, :unsupported_extension} = Documents.read_image("id_rsa")
    end
  end

  describe "list/1" do
    test "returns markdown files and directories, hiding everything else", %{root: root} do
      fixture(root, "a.md", "a")
      fixture(root, "b.txt", "b")
      fixture(root, "sub/c.md", "c")
      fixture(root, ".hidden.md", "h")

      assert {:ok, entries} = Documents.list(".")
      names = Enum.map(entries, & &1.name)

      assert "a.md" in names
      assert "sub" in names
      refute "b.txt" in names
      refute ".hidden.md" in names
    end

    test "directories sort before files", %{root: root} do
      fixture(root, "a.md", "a")
      fixture(root, "zdir/x.md", "x")

      assert {:ok, [first | _]} = Documents.list(".")
      assert first.type == :directory
    end
  end

  describe "list/1 with showHiddenFiles" do
    test "shows dotfiles once the setting is on", %{root: root} do
      fixture(root, ".notes/hidden.md", "h")

      assert {:ok, entries} = Documents.list(".")
      refute ".notes" in Enum.map(entries, & &1.name)

      {:ok, _} = Markdn.Settings.put(%{"showHiddenFiles" => true})

      assert {:ok, entries} = Documents.list(".")
      assert ".notes" in Enum.map(entries, & &1.name)
    end
  end

  describe "search/2" do
    test "finds a document nested several directories down", %{root: root} do
      fixture(root, "work/notes/design-notes.md", "d")
      fixture(root, "readme.md", "r")

      assert [%{path: "work/notes/design-notes.md"}] = Documents.search("dsn")
    end

    test "ranks a name match above a match that only lands in the directories",
         %{root: root} do
      fixture(root, "api/reference/other.md", "o")
      fixture(root, "notes/api.md", "a")

      assert [%{path: "notes/api.md"} | _] = Documents.search("api")
    end

    test "returns the most recently modified documents for a blank query", %{root: root} do
      old = fixture(root, "old.md", "o")
      recent = fixture(root, "recent.md", "r")

      # mtime has one-second resolution, so the ordering has to be set explicitly
      # rather than relying on the order the fixtures were written in.
      File.touch!(old, System.os_time(:second) - 120)
      File.touch!(recent, System.os_time(:second))

      assert [%{path: "recent.md"}, %{path: "old.md"}] = Documents.search("")
    end

    test "returns only markdown", %{root: root} do
      fixture(root, "notes.txt", "t")
      fixture(root, "notes.md", "m")

      assert [%{path: "notes.md"}] = Documents.search("notes")
    end

    test "skips dependency and build directories", %{root: root} do
      fixture(root, "node_modules/pkg/readme.md", "n")
      fixture(root, "_build/readme.md", "b")
      fixture(root, "readme.md", "r")

      assert [%{path: "readme.md"}] = Documents.search("readme")
    end

    test "does not follow symlinks out of the root", %{root: root} do
      outside =
        Path.join(System.tmp_dir!(), "markdn-outside-#{System.unique_integer([:positive])}")

      File.mkdir_p!(outside)
      File.write!(Path.join(outside, "secret.md"), "s")
      on_exit(fn -> File.rm_rf!(outside) end)

      File.ln_s!(outside, Path.join(root, "link"))

      assert [] = Documents.search("secret")
    end

    test "marks which characters matched, for highlighting", %{root: root} do
      fixture(root, "readme.md", "r")

      assert [%{matches: [0, 1]}] = Documents.search("re")
    end

    test "honours the limit", %{root: root} do
      for i <- 1..10, do: fixture(root, "note-#{i}.md", "n")

      assert Documents.search("note", limit: 3) |> length() == 3
    end
  end
end
