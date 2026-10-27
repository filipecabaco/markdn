defmodule Markdn.Host do
  @moduledoc """
  The machine MarkDN is running on, as the person using it sees it.

  The packed backend runs under ampoule, whose own `HOME` is a private `/tmp`
  deleted on exit and whose guest reports Linux on every host. The ex_tauri
  shell passes the real ones in: `EX_TAURI_HOME` (the user's home, mounted at
  its own path) and `EX_TAURI_HOST_OS` (`macos`, `ios` or `linux`). Anything
  that would otherwise ask `System.user_home!/0` or `:os.type/0` asks here, so
  the default root is not an empty `/tmp` and settings stay where they were.
  Without those variables — `mix francis.server`, tests — it is the plain BEAM
  answer.
  """

  @doc "The user's home directory."
  @spec home() :: String.t()
  def home, do: System.get_env("EX_TAURI_HOME") || System.user_home!()

  @doc "The host OS family, with iOS reported as the Darwin it is."
  @spec os_type() :: {:unix, atom()} | {:win32, atom()}
  def os_type do
    case System.get_env("EX_TAURI_HOST_OS") do
      os when os in ["macos", "ios"] -> {:unix, :darwin}
      "linux" -> {:unix, :linux}
      _ -> :os.type()
    end
  end
end
