# Development

Everything behind the product: how to run MarkDN from source, how the MDX
pipeline works, how the desktop app is packaged, and how CI and releases are
wired.

## Architecture

**Francis** (Elixir) serves the React frontend, the document API, and an **MCP
server** over one loopback port; **ex_tauri** wraps it as a native desktop app.

```
Tauri window ──▶ Francis (Bandit, 127.0.0.1)
                   ├── priv/static      the built React bundle
                   ├── /api/*           document read / write / list
                   ├── /ws              live sync between windows
                   └── /mcp             MCP server (Streamable HTTP)
```

## Running from source

```bash
mix deps.get
cd assets && pnpm install && pnpm run build && cd ..
mix francis.server                       # http://localhost:43118
```

Point it at a directory other than `$HOME`:

```bash
MARKDN_ROOT=~/notes mix francis.server
```

Frontend hot reload (Vite on 5173, proxying the API to Francis on 43118):

```bash
mix francis.server                       # terminal 1
cd assets && pnpm dev                    # terminal 2
```

## MDX rendering

### How it works

Documents are parsed with `remark-mdx`, then `remarkComponentRegistry` rewrites
each JSX node into a single `<mdx-node>` element carrying the component name and
its props as JSON, which `MdxNode` dispatches to the registered component.

Nothing is evaluated. Attribute expressions are read with `JSON.parse`, so
`count={3}` works and `count={1 + 1}` does not — a non-JSON expression is dropped
and reported in the preview rather than executed. A component that is not in the
registry renders a visible placeholder instead of silently disappearing.

Lowercase JSX names (`<kbd>`, `<sup>`) are intrinsic HTML elements per JSX rules
and pass straight through, so they are not reported as unknown components.

MDX is tried for every document, including `.md`. If it fails to parse — a stray
`<` or `{` is valid markdown but invalid MDX — the preview falls back to plain
GFM rendering rather than blanking.

The fallback pipeline is `remark-gfm` → `rehype-raw` → `rehype-sanitize` →
`rehypeSourcePositions`, in that order. Raw HTML has to become elements before it
can be sanitised, and the positions are stamped last so the sanitiser does not
strip the `data-line` attributes the sync rail navigates by. Rendering the HTML
matters: a README of `<p align="center">` and unclosed `<img>` tags is correct
markdown — only MDX demands every tag close — so printing its source would be
showing the wrong document. Sanitising it matters just as much: this window
reads and writes the user's disk over the local API, so a `<script>` in a
document would run with those hands. The schema is `rehype-sanitize`'s default
plus `align`, `width` and `height`, which decorate a README and cannot execute.

The parse error is only reported when the document meant to be MDX: a `.mdx`
extension, a registered component tag, or a top-level `import`/`export`. A `.md`
file that is simply not MDX renders as markdown with nothing said about it.

### Adding a component

1. Write it in `assets/src/components/mdx/`.
2. Register it in `assets/src/components/mdx/registry.tsx`.
3. Mirror it in `lib/markdn/mcp/components.ex` so MCP clients know it exists.
4. Add an insert snippet in `assets/src/components/ComponentPicker.tsx`.

## Search and the multibuffer

Two endpoints, two different jobs. `GET /api/search` is the palette's fuzzy file
finder, ranked by `Markdn.Fuzzy` over paths. `GET /api/search/contents` is the
multibuffer's: it walks the same tree (`Markdn.Documents.walk/0`, so the depth,
entry budget and symlink rules are shared rather than duplicated) and returns the
**whole contents** of each matching file.

Whole files, because the multibuffer edits its results and writes them back — the
lines it does not show are the ones it must not lose. Matching is literal on both
sides, never a regular expression: the server decides which files come back and
the client re-finds the same matches to underline and replace them, and two
dialects of regex would eventually disagree about a file whose excerpts are then
empty.

Client-side (`assets/src/multibuffer.ts`), a file is split into alternating
segments — the excerpts around each match, editable, and the gaps between them,
held but never shown. Editing rewrites one excerpt's text and nothing else, so
the file is always exactly `join(segments)` no matter how many lines an edit
added or removed. `excerpts/3` → `join/1` round-trips any document; that test is
the one worth keeping.

## MCP

`POST /mcp` speaks JSON-RPC 2.0 over the Streamable HTTP transport. Tools:
`list_documents`, `read_document`, `write_document`, `list_components`.

```bash
curl -s -X POST http://localhost:43118/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

An MCP `write_document` broadcasts on `/ws`, so a window with that document open
re-reads it instead of sitting on stale content.

## Security

The server binds to loopback and reads and writes files, so two guards matter:

- **`Markdn.Documents`** resolves every path and rejects anything outside the
  root, comparing path *segments* — `<root>-evil` has `<root>` as a string prefix
  but is a different directory. Only `.md`, `.markdown` and `.mdx` are readable.
- **`Markdn.Plugs.LocalGuard`** rejects requests whose `Host` is not a loopback
  name (DNS rebinding) or whose `Origin` is cross-site. It reads `conn.host`, which
  Plug populates from the Host header *and* HTTP/2's `:authority`.

## Desktop build

`config/config.exs` configures ex_tauri for Francis rather than Phoenix
(`dev_command: ~w(mix francis.server)`, `sidecar_env: []`).

```bash
mix ex_tauri.dev                       # app in a native window, live reload
mix ex_tauri.build --ci --target aarch64-apple-darwin
```

**Toolchain is pinned to OTP 27 in `mise.toml`, and that is load-bearing.** The
desktop release is Burrito-wrapped, and Burrito can only fetch an ERTS the BEAM
Machine CDN has built — there is none for OTP 28+. On a newer OTP the build fails
at the wrap step, not at compile time.

### Re-running `mix ex_tauri.install`

ex_tauri 0.2.0 reuses `config :ex_tauri, :version` for two unrelated things: the
app version stamped into `tauri.conf.json`, **and** the cargo constraint for the
Tauri CLI (`^<major>`). With MarkDN at `0.1.0` the installer asks cargo for
`tauri-cli ^0`, which does not exist, and dies. If you need to re-scaffold,
temporarily set that version to `2.0.0`, run the installer, then set it back.

CI never hits this: it installs `tauri-cli` itself with an explicit `^2`
(`TAURI_CLI_VERSION` in `release.yml`), and `mix ex_tauri.build` only reads the
binary from `_build/_tauri`.

Which is also the fix if a local build stops with **"Tauri CLI not found at
`_build/_tauri/bin/cargo-tauri`"** — anything that clears `_build` takes the CLI
with it. Reinstall it directly rather than re-running the installer:

```bash
cargo install tauri-cli --version "^2" --locked --root _build/_tauri
```

The installer also adds `ExTauri.ShutdownManager` unconditionally to the
supervision tree and generates a LiveView bridge at `assets/vendor/ex_tauri.js`.
Both are removed here: the manager is gated on `desktop_sidecar?/0` so a plain
`mix francis.server` is not killed seconds after boot, and the bridge is
Phoenix-only — the shutdown heartbeat comes from Rust over a Unix socket and
needs no JavaScript.

### Why the sidecar is spawned with `--no-halt`

`src-tauri/src/main.rs` passes `--no-halt` to the `desktop` sidecar, and that is
load-bearing for the packaged app. Burrito 1.6 launches the release as
`erlexec -noshell -s elixir start_cli ... -extra <args>`; unlike a plain
release's `bin/desktop start`, it never adds `--no-halt` of its own, so Elixir's
CLI halts the VM the moment the boot script finishes. The supervision tree comes
up, the ShutdownManager logs, and the process exits 0 in about 200ms **without
ever binding `PORT`** — then the shell waits for a port nobody is listening on
and the window never appears. The app looks hung, with nothing on screen to say
why.

This is new in Burrito 1.6. Through 1.5 the launcher passed `-s elixir start_cli`
as a single argv token, so `start_cli` never actually ran and nothing halted the
VM; 1.6 splits the flag into separate arguments and the halt starts happening.
Codrift, which is on the same ex_tauri and Francis but is locked to Burrito
1.5.0, is unaffected — so "it works over there" is a lockfile difference, not a
code difference. Pinning `{:burrito, "~> 1.5.0", override: true}` is the other
way out; `--no-halt` is preferred because it is correct on both.

`mix ex_tauri.install` regenerates `main.rs` without the flag, so re-scaffolding
re-introduces the hang.

The same edit replaces the unbounded `check_server_started` loop with
`await_server`, modelled on Codrift's: the sidecar's `Terminated` event flips a
flag the wait checks, so a backend that dies is reported the moment it dies
instead of at a deadline, the wait is bounded at 60s either way, and the reason
is painted into the window by `show_startup_error` rather than leaving a blank
frame. Sidecar stderr is now forwarded too — dropping it is part of why the
original failure looked like a freeze instead of a crash.

Reproduce it directly, without Tauri in the way:

```bash
PORT=43999 ./burrito_out/desktop_aarch64-apple-darwin              # exits 0, serves nothing
PORT=43999 ./burrito_out/desktop_aarch64-apple-darwin --no-halt    # stays up, /api/health answers
```

### Why Bandit is supervised by hand

ex_tauri's README documents `config :francis, bandit_opts: ...` for binding the
injected `PORT`, but that needs an unreleased francis 0.3.4 — through 0.3.3 Francis
reads `:bandit_opts` from the `use Francis` macro options only and silently
discards application env, which would bind port 4000 while the webview pointed at
the injected port. `Markdn.start/2` starts Bandit itself and reads `:markdn`
config instead, so this works on published Francis. Revisit when 0.3.4 ships.

## CI and releases

`.github/workflows/ci.yml` — four gates on every push and PR:

| Job | What it runs |
|---|---|
| `lint` | `mix format --check-formatted`, `mix credo --strict`, `mix dialyzer` |
| `test` | `mix compile --warnings-as-errors`, `mix test` |
| `frontend` | `pnpm check`, `pnpm test`, `pnpm build` |
| `scripts` | `shellcheck`, then runs the installer end-to-end against a stubbed release |
| `desktop` | builds the `:desktop` release, **boots it**, and smoke-tests it |

The desktop job is the one that earns its keep. Compiling proves nothing about
static asset resolution: in dev the bundle is read from a cwd-relative
`priv/static`, but inside a release it must resolve through `:code.priv_dir/1`.
Get that wrong and everything compiles, boots, and shows a blank window with no
error. `.github/scripts/smoke-sidecar.sh` boots the assembled release and asserts
`/api/health`, the SPA shell, the hashed bundle it references, and `POST /mcp` all
answer.

`.github/scripts/test-install.sh` stubs `curl` and `uname` so `install.sh` runs its
real Linux path against a canned release, then corrupts the payload and asserts
the install **fails**. A checksum check that never rejects anything passes every
happy-path test while protecting nobody.

`.github/workflows/release.yml` — `version → bundle → release → verify → cask`:

1. **version** derives the next semver from Conventional Commit prefixes since the
   last release (`fix:` patch, `feat:` minor, `!`/`BREAKING CHANGE` major). No
   matching commit means no release. A `workflow_dispatch` input overrides it.
   Both tags *and* published releases are consulted, because a tag can be missing
   from the checkout while its release is live.
2. **bundle** stamps that version into `mix.exs` and `tauri.conf.json`, then builds
   on three runners (macOS arm64, macOS x86_64, Linux x86_64), publishing a
   `.sha256` beside every artifact.
3. **release** publishes everything in one step once all three legs succeed —
   never per-leg, or one failing runner leaves a tag and a half-populated release
   behind. It re-asserts that each asset carries the version being tagged and that
   the release does not already exist.
4. **verify-install** runs `install.sh` on a clean macOS and Linux runner against
   the release that was just published, and asserts the app actually landed. The
   installer matches assets by name, so a change in how Tauri names a bundle
   breaks `curl | sh` silently while every unit test stays green.
5. **cask** rewrites `Casks/markdn.rb` (version, both checksums, both arch
   segments), re-verifies it by downloading the DMGs over the URLs Homebrew will
   use, and pushes to `main`.

`.github/workflows/cask.yml` re-verifies the cask daily, catching drift from a
release that was deleted and re-cut — the rebuilt DMG will not hash the same, and
nothing in the release path would ever notice.

To cut a release: merge a `feat:` or `fix:` commit to `main`. To force one, run
the Release workflow manually with an explicit version.

### `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`

pnpm 11 refuses packages published within a cooldown window — a supply-chain
guard, and worth keeping. A lockfile resolved just after some transitive
dependency was published will trip it until that package ages out. Re-resolve
rather than relaxing the policy:

```bash
cd assets && pnpm clean --lockfile && pnpm install
```

## Tests

```bash
mix test                  # documents, router, guards, MCP        (26 tests)
cd assets && pnpm test    # remark pipeline, Preview, Tabs        (17 tests)
cd assets && pnpm check   # typecheck
mix credo --strict && mix dialyzer
bash .github/scripts/smoke-sidecar.sh   # against a built release
bash .github/scripts/test-install.sh    # installer, incl. tamper rejection
shellcheck -s sh install.sh
```

## Layout

```
lib/markdn.ex                 application + Francis router
lib/markdn/documents.ex       path confinement, read/write/list
lib/markdn/mcp/handler.ex     JSON-RPC dispatch and tools
lib/markdn/mcp/components.ex  registry mirror for MCP clients
lib/markdn/plugs/local_guard.ex
assets/src/                   React frontend
legacy/                       previous node_modules + pnpm-lock, kept for reference
docs/MDX_COMPONENT_SUMMARY.md the original research note
docs/screenshots/             README screenshots
```
