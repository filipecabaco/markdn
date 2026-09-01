import Config

# In production the Rust shell asks the OS for a free ephemeral port and injects
# it as PORT — it is almost never the :port configured above. An app that binds a
# hardcoded port gets a blank window and no error explaining why.
#
# ex_tauri's README documents `config :francis, bandit_opts: ...` for this, but
# that path needs an unreleased francis 0.3.4; through 0.3.3 Francis resolves
# :bandit_opts from the `use Francis` macro options only and silently discards
# the application env. Markdn.start/2 reads :markdn config and passes it to
# Bandit directly, so this works on the published Francis.
if port = System.get_env("PORT") do
  config :markdn, bandit_opts: [ip: {127, 0, 0, 1}, port: String.to_integer(port)]
end

# Root directory the document API is allowed to touch. Defaults to the user's
# home; every path is still checked against it at request time.
if root = System.get_env("MARKDN_ROOT") do
  config :markdn, root: Path.expand(root)
end
