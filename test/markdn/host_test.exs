defmodule Markdn.HostTest do
  use ExUnit.Case, async: false

  alias Markdn.Host

  setup do
    saved =
      for key <- ~w(EX_TAURI_HOME EX_TAURI_HOST_OS MARKDN_CONFIG_DIR),
          do: {key, System.get_env(key)}

    on_exit(fn ->
      for {key, value} <- saved do
        if value, do: System.put_env(key, value), else: System.delete_env(key)
      end

      Markdn.Settings.refresh()
    end)

    for {key, _} <- saved, do: System.delete_env(key)
    :ok
  end

  test "without the shell's variables it is the plain BEAM answer" do
    assert Host.home() == System.user_home!()
    assert Host.os_type() == :os.type()
  end

  test "under ampoule it is the real home and OS the shell passes in" do
    System.put_env("EX_TAURI_HOME", "/Users/someone")
    System.put_env("EX_TAURI_HOST_OS", "macos")

    assert Host.home() == "/Users/someone"
    assert Host.os_type() == {:unix, :darwin}

    System.put_env("EX_TAURI_HOST_OS", "ios")
    assert Host.os_type() == {:unix, :darwin}

    System.put_env("EX_TAURI_HOST_OS", "linux")
    assert Host.os_type() == {:unix, :linux}
  end

  test "settings stay where the Burrito build kept them, not in ampoule's /tmp" do
    System.put_env("EX_TAURI_HOME", "/Users/someone")
    System.put_env("EX_TAURI_HOST_OS", "macos")

    assert Markdn.Settings.dir() ==
             "/Users/someone/Library/Application Support/app.markdn.desktop"
  end
end
