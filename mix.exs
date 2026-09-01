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
      # 0.3.3 is the newest published release. The `config :francis, bandit_opts:`
      # recipe in ex_tauri's README needs an unreleased 0.3.4, so Markdn does not
      # use it — `Markdn.start/2` supervises Bandit itself and reads the port from
      # `:markdn` config, which works on every Francis version. See config/runtime.exs.
      {:francis, "~> 0.3.3"},
      {:ex_tauri, "~> 0.2"},
      {:jason, "~> 1.4"},
      {:credo, "~> 1.7", only: [:dev, :test], runtime: false},
      {:dialyxir, "~> 1.4", only: [:dev], runtime: false},
      {:sobelow, "~> 0.13", only: [:dev, :test], runtime: false},
      {:mix_audit, "~> 2.1", only: [:dev, :test], runtime: false}
    ]
  end

  defp releases do
    [
      # The Tauri sidecar. `mix ex_tauri.dev` sets BURRITO_SKIP=true for a plain
      # release; the shipped build is Burrito-wrapped into a single binary.
      desktop: [
        steps: [&build_assets/1, :assemble] ++ burrito_steps(),
        burrito: [
          targets: [
            "aarch64-apple-darwin": [os: :darwin, cpu: :aarch64],
            "x86_64-apple-darwin": [os: :darwin, cpu: :x86_64],
            "x86_64-unknown-linux-gnu": [os: :linux, cpu: :x86_64]
          ]
        ]
      ]
    ]
  end

  defp burrito_steps do
    if System.get_env("BURRITO_SKIP") == "true", do: [], else: [&Burrito.wrap/1]
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
