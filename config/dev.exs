import Config

config :markdn, bandit_opts: [port: 43_118]

# Note: `config :francis, dev: true` is deliberately not set. It only takes
# effect inside Francis's own start/2, which Markdn overrides (see Markdn's
# moduledoc), so it would start no watcher and only mislead. Frontend hot reload
# comes from the Vite dev server instead — `pnpm dev` in assets/.
