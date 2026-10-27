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

    test "refuses a symlink inside the root that points out of it", %{root: root} do
      outside =
        Path.join(System.tmp_dir!(), "markdn-outside-#{System.unique_integer([:positive])}")

      File.mkdir_p!(outside)
      File.write!(Path.join(outside, "secret.md"), "secret")
      on_exit(fn -> File.rm_rf!(outside) end)

      File.ln_s!(Path.join(outside, "secret.md"), Path.join(root, "file-link.md"))
      File.ln_s!(outside, Path.join(root, "dir-link"))

      assert {:error, :outside_root} = Documents.read("file-link.md")
      assert {:error, :outside_root} = Documents.read("dir-link/secret.md")
      assert {:error, :outside_root} = Documents.write("dir-link/planted.md", "x")
      assert {:error, :outside_root} = Documents.create("dir-link/new.md")
      refute File.exists?(Path.join(outside, "planted.md"))
    end

    test "follows `..` in a link target the way the kernel does", %{root: root} do
      # inner/up -> ".." is the root. inner/out -> "up/../elsewhere" reads, taken
      # lexically, as inner/elsewhere; the kernel follows `up` first and lands in
      # the root's *parent*. Only the second answer is the file that would open.
      File.mkdir_p!(Path.join(root, "inner"))
      File.ln_s!("..", Path.join(root, "inner/up"))
      File.ln_s!("up/../elsewhere", Path.join(root, "inner/out"))

      assert {:error, :outside_root} = Documents.safe_path("inner/out/escape.md")
      assert {:ok, _} = Documents.safe_path("inner/up/fine.md")
    end

    test "allows a symlink that stays inside the root", %{root: root} do
      fixture(root, "real/note.md", "# Real")
      File.ln_s!(Path.join(root, "real"), Path.join(root, "alias"))

      assert {:ok, "# Real"} = Documents.read("alias/note.md")
    end

    test "gives up on a symlink loop rather than spinning", %{root: root} do
      File.ln_s!(Path.join(root, "b"), Path.join(root, "a"))
      File.ln_s!(Path.join(root, "a"), Path.join(root, "b"))

      assert {:error, :outside_root} = Documents.safe_path("a/x.md")
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

    test "treats the extension case-insensitively", %{root: root} do
      fixture(root, "README.MD", "# Shouting")
      assert {:ok, "# Shouting"} = Documents.read("README.MD")
    end
  end

  describe "create/2" do
    test "creates a document and its parent directories", %{root: root} do
      assert {:ok, "notes/deep/new.md"} = Documents.create("notes/deep/new.md", "# New")
      assert File.read!(Path.join(root, "notes/deep/new.md")) == "# New"
    end

    test "defaults to an empty document", %{root: root} do
      assert {:ok, "blank.md"} = Documents.create("blank.md")
      assert File.read!(Path.join(root, "blank.md")) == ""
    end

    test "answers with the path normalised against the root", %{root: root} do
      assert {:ok, "a/b.md"} = Documents.create("./a/../a/b.md")
      assert {:ok, "c.md"} = Documents.create(Path.join(root, "c.md"))
    end

    test "never replaces an existing document", %{root: root} do
      fixture(root, "taken.md", "keep me")
      assert {:error, :eexist} = Documents.create("taken.md", "clobbered")
      assert File.read!(Path.join(root, "taken.md")) == "keep me"
    end

    test "refuses a name that is only an extension" do
      # A dotfile has no extension as far as Path is concerned, and the tree would
      # hide it the moment it was created.
      assert {:error, :unsupported_extension} = Documents.create("notes/.md")
    end

    test "is confined to the root and to markdown, for create" do
      assert {:error, :outside_root} = Documents.create("../escape.md")
      assert {:error, :unsupported_extension} = Documents.create("script.sh")
      assert {:error, :unsupported_extension} = Documents.create("folder/")
    end
  end

  describe "rename/2" do
    test "moves a document, creating the target directory", %{root: root} do
      fixture(root, "a.md", "# A")
      assert {:ok, "archive/b.md"} = Documents.rename("a.md", "archive/b.md")
      refute File.exists?(Path.join(root, "a.md"))
      assert File.read!(Path.join(root, "archive/b.md")) == "# A"
    end

    test "never overwrites the target", %{root: root} do
      fixture(root, "a.md", "A")
      fixture(root, "b.md", "B")
      assert {:error, :eexist} = Documents.rename("a.md", "b.md")
      assert File.read!(Path.join(root, "b.md")) == "B"
      assert File.read!(Path.join(root, "a.md")) == "A"
    end

    test "allows a change of case only", %{root: root} do
      fixture(root, "notes.md", "N")
      assert {:ok, "Notes.md"} = Documents.rename("notes.md", "Notes.md")
      assert File.read!(Path.join(root, "Notes.md")) == "N"
    end

    test "is confined to the root and to markdown documents", %{root: root} do
      fixture(root, "a.md", "A")
      File.mkdir_p!(Path.join(root, "dir.md"))
      assert {:error, :outside_root} = Documents.rename("a.md", "../out.md")
      assert {:error, :unsupported_extension} = Documents.rename("a.md", "a.sh")
      assert {:error, :not_a_document} = Documents.rename("dir.md", "other.md")
      assert {:error, :enoent} = Documents.rename("ghost.md", "other.md")
    end
  end

  describe "trash/1" do
    test "removes the document through the configured trash command", %{root: root} do
      fixture(root, "old.md", "bye")
      assert :ok = Documents.trash("old.md")
      refute File.exists?(Path.join(root, "old.md"))
    end

    test "refuses anything that is not a markdown document in the root", %{root: root} do
      fixture(root, "keep.txt", "x")
      File.mkdir_p!(Path.join(root, "folder.md"))
      assert {:error, :unsupported_extension} = Documents.trash("keep.txt")
      assert {:error, :not_a_document} = Documents.trash("folder.md")
      assert {:error, :outside_root} = Documents.trash("../x.md")
      assert {:error, :enoent} = Documents.trash("ghost.md")
      assert File.exists?(Path.join(root, "keep.txt"))
    end

    test "reports a failing trash command instead of claiming success", %{root: root} do
      fixture(root, "stuck.md", "x")
      previous = Application.get_env(:markdn, :trash_command)
      Application.put_env(:markdn, :trash_command, {"false", []})
      on_exit(fn -> Application.put_env(:markdn, :trash_command, previous) end)

      assert {:error, :trash_failed} = Documents.trash("stuck.md")
      assert File.exists?(Path.join(root, "stuck.md"))
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
