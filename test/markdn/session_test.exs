defmodule Markdn.SessionTest do
  use Markdn.DocumentCase, async: false

  alias Markdn.Session

  test "is empty when nothing has been written" do
    assert Session.get() == %{"document" => nil, "view" => nil, "draft" => nil}
  end

  test "merges what is put and reads it back" do
    assert {:ok, _} = Session.put(%{"document" => "notes/a.md", "view" => "preview"})

    assert {:ok, _} =
             Session.put(%{"draft" => %{"path" => "notes/a.md", "contents" => "# Edited"}})

    assert %{
             "document" => "notes/a.md",
             "view" => "preview",
             "draft" => %{"path" => "notes/a.md", "contents" => "# Edited"}
           } = Session.get()
  end

  test "keeps a draft of the untitled buffer, and clears it with nil" do
    assert {:ok, %{"draft" => %{"path" => nil}}} = Session.put(%{"draft" => %{"contents" => "x"}})
    assert {:ok, %{"draft" => nil}} = Session.put(%{"draft" => nil})
  end

  test "refuses a value of the wrong shape and ignores unknown keys" do
    assert {:error, {:invalid, "view"}} = Session.put(%{"view" => "sideways"})
    assert {:error, {:invalid, "draft"}} = Session.put(%{"draft" => %{"contents" => 1}})
    assert {:ok, session} = Session.put(%{"cursor" => 12})
    refute Map.has_key?(session, "cursor")
  end

  test "survives a corrupt or hand-broken file" do
    File.mkdir_p!(Path.dirname(Session.path()))
    File.write!(Session.path(), "{not json")
    assert Session.get()["document"] == nil

    File.write!(Session.path(), ~s({"document": "a.md", "view": "sideways"}))
    assert %{"document" => "a.md", "view" => nil} = Session.get()
  end

  test "leaves no temporary file behind" do
    assert {:ok, _} = Session.put(%{"document" => "a.md"})
    assert [_session] = Path.wildcard(Path.join(Path.dirname(Session.path()), "session.json*"))
  end
end
