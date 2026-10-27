import Config

# Port 0 lets the OS pick, so concurrent test runs never collide.
config :markdn, bandit_opts: [port: 0]

# A plain `rm` stands in for the system Trash, so the suite exercises the move
# without filling the developer's real Trash with fixtures.
config :markdn, trash_command: {"rm", []}
