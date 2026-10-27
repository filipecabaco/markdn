defmodule Markdn.MixProject do
  use Mix.Project

  @version "0.1.0"

  def project do
    [
      app: :markdn,
      version: @version,
      elixir: "~> 1.17",
      start_permanent: Mix.env() == :prod,
      elixirc_paths: elixirc_paths(Mix.env()),
      deps: deps(),
      releases: releases(),
      dialyzer: [
        plt_file: {:no_warn, "priv/plts/dialyzer.plt"},
        plt_add_apps: [:mix],
        ignore_warnings: ".dialyzer_ignore.exs",
        list_unused_filters: true
      ]
    ]
  end

  def application do
    [mod: {Markdn, []}, extra_applications: [:logger]]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  defp deps do
    [
      # `Markdn.start/2` supervises Bandit itself and reads the port from `:markdn`
      # config rather than `config :francis, bandit_opts:` — see Markdn's moduledoc.
      # 0.4 also compiles `static`/`parser` with compile_env, so those stay in
      # config/config.exs and must never move to runtime.exs.
      {:francis, "~> 0.4.0"},
      # The library and the Rust shell speak one heartbeat protocol, so a bump
      # past 0.5 means regenerating src-tauri/src/main.rs from its template too
      # (and src/lib.rs with `mix ex_tauri.ios init`).
      {:ex_tauri, "~> 0.5.1"},
      {:jason, "~> 1.4"},
      {:credo, "~> 1.7", only: [:dev, :test], runtime: false},
      {:dialyxir, "~> 1.4", only: [:dev], runtime: false},
      {:sobelow, "~> 0.13", only: [:dev, :test], runtime: false},
      {:mix_audit, "~> 2.1", only: [:dev, :test], runtime: false}
    ]
  end

  defp releases do
    [
      # The Tauri sidecar, on the desktop and on iOS. ampoule packs it into one
      # binary (`config :ex_tauri, :packager, :ampoule`; ampoule.toml lists the
      # host programs it may start), for the build machine's own platform.
      desktop: [steps: [&build_assets/1, :assemble]]
    ]
  end

  # Rebuild the React bundle into priv/static before the release copies priv in,
  # so the webview can never serve a stale bundle.
  defp build_assets(release) do
    Mix.shell().info("==> Building frontend (assets -> priv/static)")

    {_out, status} =
      System.cmd("pnpm", ["run", "build"],
        cd: "assets",
        into: IO.stream(:stdio, :line),
        stderr_to_stdout: true
      )

    if status != 0, do: Mix.raise("Frontend build failed: `pnpm run build` exited #{status}")

    release
  end
end
