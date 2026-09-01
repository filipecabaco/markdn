import Config

# Overridden by the injected PORT in config/runtime.exs when running as the
# Tauri sidecar; this is only the standalone-server fallback.
config :markdn, bandit_opts: [port: 43_118]
