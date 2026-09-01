import Config

# Tauri desktop shell. The webview points at the Francis server; in dev that is
# the fixed port below, in production an OS-assigned ephemeral port injected as
# PORT (see config/runtime.exs).
config :ex_tauri,
  app_name: "MarkDN",
  host: "localhost",
  port: 43_118,
  version: "0.1.0",
  fullscreen: false,
  width: 1400,
  height: 900,
  # ex_tauri 0.2.0 defaults to Phoenix. MarkDN is a Francis app: the dev sidecar
  # runs `mix francis.server`, and the production sidecar gets no PHX_* vars
  # (PORT and SECRET_KEY_BASE are always injected regardless).
  dev_command: ~w(mix francis.server),
  sidecar_env: []

# Serve the built React bundle app-relative via :code.priv_dir. The default
# "priv/static" is cwd-relative and 404s inside a release, which is exactly how
# the desktop build runs.
config :francis, static: [from: {:markdn, "priv/static"}, at: "/"]

# Bind to loopback only. MarkDN is a local desktop sidecar whose routes read and
# write files on disk, so the socket must never be reachable from the LAN.
# Deep-merged with each env's :port below.
config :markdn, bandit_opts: [ip: {127, 0, 0, 1}]

import_config "#{config_env()}.exs"
