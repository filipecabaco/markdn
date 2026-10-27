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
(`dev_command: ~w(mix francis.server)`, `sidecar_env: []`) and packs the backend
with [ampoule](https://github.com/filipecabaco/ampoule) (`packager: :ampoule`):
one binary running the BEAM as WebAssembly, the same packer the iOS build uses.

```bash
mix ex_tauri.dev                       # app in a native window, live reload
mix ex_tauri.build --ci --target aarch64-apple-darwin
```

`mix ex_tauri.build` needs `ampoule` on `PATH` (or `config :ex_tauri,
:ampoule_path`). CI installs a pinned release with
`.github/scripts/install-ampoule.sh`; locally, download the same one from the
[ampoule releases](https://github.com/filipecabaco/ampoule/releases).

**OTP is pinned to the exact patch ampoule embeds, and that is load-bearing.**
ampoule's runtime runs a release only from the OTP it was built with:
`ampoule version` prints its ERTS (0.1.8 embeds ERTS 16.4.0.4, OTP 28.5.0.4).
`mise.toml`, `ci.yml` and `release.yml` pin that patch; bump them together with
`AMPOULE_VERSION`.

### What the packed backend can see

Under ampoule the backend's own `HOME` is a private `/tmp` deleted on exit, and
the guest reports Linux on every host. The shell passes the real ones in
(`EX_TAURI_HOME`, `EX_TAURI_HOST_OS`) and mounts the home at its own path;
`Markdn.Host` is what the code asks instead of `System.user_home!/0` or
`:os.type/0`, so the default root and `settings.json` stay where they always
were. The backend logs to `~/Library/Logs/MarkDN/markdn_desktop.log` (on Linux,
`ExTauri.Paths.log_dir/0`); the shell's own log, sidecar output included, is in
`~/Library/Logs/app.markdn.desktop/`.

A packed app starts no host program unless `ampoule.toml` allows it. MarkDN
starts one kind, to move a document to the Trash: `/usr/bin/trash`,
`osascript` (older macOS) and `gio` (Linux) are listed there. A new
`System.cmd/3` needs its program added, or it fails with `:enoent`.

### The loading screen

The window opens on `src-tauri/loading/index.html`, bundled into the app as
`frontendDist` in `tauri.conf.json`, not on the backend's URL: in a release the
port is OS-assigned and nothing is listening yet. `main.rs` navigates to
`http://localhost:<port>` once the port answers. If the backend never answers,
or dies later, the shell shows its own page saying so (and restarts a backend
that dies under an open window, up to three times).

The page is self-contained (inline styles and script, DESIGN.md tokens inlined)
because nothing it needs can come from the server it is waiting for. Dev runs are
unaffected: `mix ex_tauri.dev` opens on `devUrl`.

### Regenerating the shell

`src-tauri/src/main.rs` is ex_tauri's template output and speaks its heartbeat
protocol, so moving to a new ex_tauri minor means regenerating it. Do it from
the template helper, not `mix ex_tauri.install`: the installer also rewrites
`tauri.conf.json`, and with it the identifier — `app.markdn.desktop` is where
settings live and what the Homebrew cask's `zap` removes — and the window's
`frontendDist`.

```bash
mix run --no-start -e '
  File.write!("src-tauri/src/main.rs",
    ExTauri.Install.Helpers.main_src("localhost", "43118", "markdn", "MarkDN", "http", ExTauri.release_name()))'
```

If a local build stops with **"Tauri CLI not found at
`_build/_tauri/bin/cargo-tauri`"** — anything that clears `_build` takes the
CLI with it — reinstall it directly:

```bash
cargo install tauri-cli --version "^2" --locked --root _build/_tauri
```

The `ExTauri.ShutdownManager` is gated on `desktop_sidecar?/0` (in `Markdn`), so
a plain `mix francis.server` is not stopped seconds after boot.

### iPhone and iPad

```bash
mix ex_tauri.ios run --device "iPad Pro 11-inch (M5)"   # the packed backend, as it ships
mix ex_tauri.ios dev                                      # your dev server, live reload
```

This runs in the iOS simulator only (see ex_tauri's `guides/ios.md`).
`mix ex_tauri.ios init` regenerates `src-tauri/src/lib.rs` and
`tauri.ios.conf.json` and keeps `src-tauri/mobile/index.html`, the iOS loading
page. On iOS the documents are the app's own Documents folder, the one the Files
app shows (`config/runtime.exs`).

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
