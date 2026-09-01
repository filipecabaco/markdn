defmodule Markdn.SettingsTest do
  use Markdn.DocumentCase, async: false

  alias Markdn.Documents
  alias Markdn.Settings

  describe "all/0" do
    test "returns the defaults when nothing has been written" do
      assert Settings.all() == Settings.defaults()
    end

    test "reads a hand-written file" do
      write_settings(%{"theme" => "dark", "editorFontSize" => 16})

      assert %{"theme" => "dark", "editorFontSize" => 16} = Settings.all()
    end

    test "falls back to the default for a value that does not fit" do
      write_settings(%{"theme" => "chartreuse", "showHiddenFiles" => true})

      settings = Settings.all()
      assert settings["theme"] == "system"
      # The rest of a partly-broken file still applies.
      assert settings["showHiddenFiles"] == true
    end

    test "survives a corrupt file" do
      File.mkdir_p!(Settings.dir())
      File.write!(Settings.path(), "{not json")

      assert Settings.all() == Settings.defaults()
    end
  end

  describe "put/1" do
    test "writes to the settings file and reads back" do
      assert {:ok, settings} = Settings.put(%{"theme" => "light"})
      assert settings["theme"] == "light"

      assert File.exists?(Settings.path())
      assert Settings.refresh()["theme"] == "light"
    end

    test "merges rather than replacing" do
      {:ok, _} = Settings.put(%{"theme" => "dark"})
      {:ok, settings} = Settings.put(%{"editorFontSize" => 18})

      assert settings["theme"] == "dark"
      assert settings["editorFontSize"] == 18
    end

    test "rejects a root that is not a directory" do
      assert {:error, {:invalid, "root"}} = Settings.put(%{"root" => "/nope/not/here"})
    end

    test "rejects out-of-range numbers", %{root: root} do
      assert {:error, {:invalid, "editorFontSize"}} = Settings.put(%{"editorFontSize" => 99})
      assert {:error, {:invalid, "autoScrollSpeed"}} = Settings.put(%{"autoScrollSpeed" => 0})
      # ...and accepts the ends of the ranges.
      assert {:ok, _} = Settings.put(%{"editorFontSize" => 24, "autoScrollSpeed" => 5})
      assert {:ok, _} = Settings.put(%{"root" => root})
    end

    test "ignores keys it does not know" do
      assert {:ok, settings} = Settings.put(%{"nonsense" => true})
      refute Map.has_key?(settings, "nonsense")
    end
  end

  describe "the root setting" do
    test "takes effect once MARKDN_ROOT is not pinning it", %{root: root} do
      notes = Path.join(root, "notes")
      File.mkdir_p!(notes)
      {:ok, _} = Settings.put(%{"root" => notes})

      # Pinned: the environment still wins.
      assert Documents.root() == root
      assert Documents.root_locked?()

      unpin_root()
      assert Documents.root() == notes
      refute Documents.root_locked?()
    end
  end

  defp write_settings(map) do
    File.mkdir_p!(Settings.dir())
    File.write!(Settings.path(), Jason.encode!(map))
    Settings.refresh()
  end
end
