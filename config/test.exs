import Config

# Port 0 lets the OS pick, so concurrent test runs never collide.
config :markdn, bandit_opts: [port: 0]
