defmodule Markdn.OpenerTest do
  use Markdn.DocumentCase, async: false

  alias Markdn.Documents
  alias Markdn.Opener

  setup do
    # Whatever an earlier test left pending is not this test's request.
    Opener.take()
    :ok
  end

  test "a document inside the root opens by its root-relative path", %{root: root} do
    fixture(root, "notes/todo.md", "# todo")

    :ok = Opener.request([Path.join(root, "notes/todo.md")])

    assert %{document: "notes/todo.md", root: nil, error: nil} = Opener.take()
  end

  test "take clears the request, so only one window opens it", %{root: root} do
    fixture(root, "a.md", "a")
    :ok = Opener.request([Path.join(root, "a.md")])

    assert %{document: "a.md"} = Opener.take()
    assert %{document: nil, root: nil, error: nil} = Opener.take()
  end

  test "the last path wins and errors are kept", %{root: root} do
    fixture(root, "a.md", "a")
    fixture(root, "b.md", "b")

    :ok =
      Opener.request([
        Path.join(root, "a.md"),
        Path.join(root, "missing.md"),
        Path.join(root, "b.md")
      ])

    assert %{document: "b.md", root: nil, error: error} = Opener.take()
    assert error =~ "missing.md does not exist"
  end

  test "a file that is not markdown is refused", %{root: root} do
    fixture(root, "picture.png", "png")

    :ok = Opener.request([Path.join(root, "picture.png")])

    assert %{document: nil, error: "picture.png is not a markdown document"} = Opener.take()
  end

  test "the current root opens without moving it", %{root: root} do
    :ok = Opener.request([root])

    assert %{document: nil, root: nil, error: nil} = Opener.take()
  end

  test "a pinned root is never moved", %{root: root} do
    outside = Path.join(root <> "-outside", "elsewhere.md")
    File.mkdir_p!(Path.dirname(outside))
    File.write!(outside, "x")
    on_exit(fn -> File.rm_rf!(Path.dirname(outside)) end)

    :ok = Opener.request([outside])

    assert %{document: nil, root: nil, error: error} = Opener.take()
    assert error =~ "MARKDN_ROOT"
    assert Documents.root() == root
  end

  describe "with the root unpinned" do
    setup %{root: root} do
      unpin_root()
      {:ok, _} = Markdn.Settings.put(%{"root" => root})
      :ok
    end

    test "a directory becomes the root", %{root: root} do
      notes = Path.join(root, "notes")
      File.mkdir_p!(notes)

      :ok = Opener.request([notes])

      assert %{document: nil, root: ^notes, error: nil} = Opener.take()
      assert Documents.root() == notes
    end

    test "a file outside the root moves the root to its folder", %{root: root} do
      elsewhere = Path.join(root, "elsewhere")
      fixture(root, "elsewhere/far.md", "far")

      {:ok, _} =
        Markdn.Settings.put(%{"root" => Path.join(root, "notes") |> tap(&File.mkdir_p!/1)})

      :ok = Opener.request([Path.join(elsewhere, "far.md")])

      assert %{document: "far.md", root: ^elsewhere, error: nil} = Opener.take()
      assert Documents.root() == elsewhere
    end

    test "a folder then a file in it opens the file under the new root", %{root: root} do
      notes = Path.join(root, "notes")
      fixture(root, "notes/todo.md", "todo")

      :ok = Opener.request([notes, Path.join(notes, "todo.md")])

      assert %{document: "todo.md", root: ^notes, error: nil} = Opener.take()
    end
  end

  test "a shell event is resolved like a request", %{root: root} do
    fixture(root, "from-shell.md", "x")

    send(
      Opener,
      {:ex_tauri_event, "open_paths", %{"paths" => [Path.join(root, "from-shell.md")]}}
    )

    send(Opener, {:ex_tauri_event, "menu_click", %{"id" => "something"}})

    assert %{document: "from-shell.md"} = Opener.take()
  end
end
