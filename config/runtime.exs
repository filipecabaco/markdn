import Config

# In production the Rust shell asks the OS for a free ephemeral port and injects
# it as PORT — it is almost never the :port configured above. An app that binds a
# hardcoded port gets a blank window and no error explaining why.
#
# Read from :markdn, not `config :francis, bandit_opts:` — Markdn.start/2
# overrides Francis's start and passes this to Bandit itself.
if port = System.get_env("PORT") do
  config :markdn, bandit_opts: [ip: {127, 0, 0, 1}, port: String.to_integer(port)]
end

# Root directory the document API is allowed to touch. Defaults to the user's
# home; every path is still checked against it at request time.
if root = System.get_env("MARKDN_ROOT") do
  config :markdn, root: Path.expand(root)
end

# On iPhone and iPad the documents are the app's own Documents folder, the one
# the Files app shows. The backend's HOME there is a private /tmp deleted on
# exit, so the default above would show an empty, vanishing root; ExTauri.Paths
# resolves the real folder inside the app's container. Guarded so builds on an
# ex_tauri without documents_dir/0 behave as before.
if is_nil(System.get_env("MARKDN_ROOT")) and System.get_env("EX_TAURI_HOST_OS") == "ios" and
     Code.ensure_loaded?(ExTauri.Paths) and function_exported?(ExTauri.Paths, :documents_dir, 0) do
  config :markdn, root: ExTauri.Paths.documents_dir()

  # Settings likewise: their default resolves under that deleted-on-exit /tmp.
  if is_nil(System.get_env("MARKDN_CONFIG_DIR")) do
    System.put_env("MARKDN_CONFIG_DIR", ExTauri.Paths.config_dir())
  end
end
