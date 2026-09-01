# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases are cut automatically from Conventional Commit prefixes on `main`
(`fix:` patch, `feat:` minor, `type!:` / `BREAKING CHANGE` major). The version in
`mix.exs` and `src-tauri/tauri.conf.json` is a placeholder — the release workflow
stamps the resolved number into both before building.

## [Unreleased]

### Added

- Markdown/MDX viewer and editor served by Francis: split editor and preview,
  lazily expanding document tree, component picker on `Cmd/Ctrl+Shift+C`.
- MDX component registry (`Alert`, `Callout`, `Card`, `Tabs`, `Tab`) resolved
  without runtime evaluation — attribute expressions are read with `JSON.parse`,
  and anything that is not JSON is dropped and reported rather than executed.
- Mermaid diagrams and Shiki syntax highlighting, both lazily imported.
- MCP server at `POST /mcp` (Streamable HTTP): `list_documents`, `read_document`,
  `write_document`, `list_components`. An MCP write broadcasts on `/ws` so an open
  window re-reads the file.
- `Markdn.Plugs.LocalGuard` rejects cross-origin and DNS-rebinding requests;
  `Markdn.Documents` confines every path to the configured root.
- CI (format, credo, dialyzer, Elixir tests, frontend typecheck/tests/build,
  shellcheck + installer e2e, desktop release + booted smoke test) and a release
  pipeline producing macOS DMGs and Linux `.deb`/`.AppImage`, with a self-bumping
  Homebrew cask.
- `install.sh` for `curl | sh` installation on macOS and Linux, with mandatory
  `.sha256` verification, quarantine stripping, and a Linux desktop entry. The
  release pipeline runs it against every published release before bumping the
  cask.

### Design

- Precision-instrument visual system in OKLCH: warm graphite neutrals, a single
  signal-red accent reserved for state, hairlines instead of shadows. Light and
  dark are both designed surfaces. See `DESIGN.md`.
- **Linked panes.** Source and render track each other by *block*, from real
  source positions stamped on the hast tree, not by scroll percentage — a
  three-line mermaid fence and its 200px render stay aligned. A sync rail between
  the panes draws the correspondence and marks the caret's block.
- Images resolve from documents: relative to the document's own directory,
  root-absolute, absolute filesystem paths, and external URLs. Served by a new
  `/api/image` under the same root confinement as everything else.
- MarkDN mark, favicon and generated app icon set.

### Toolchain

- Pinned in `mise.toml` and mirrored in both workflows: Erlang/OTP **27.3.4.16**,
  Elixir **1.20.4**, Node **26**, Zig **0.16.0**, pnpm **11**.
- OTP stays on 27 and Zig on exactly 0.16.0 because Burrito 1.6.0 requires both —
  it can only fetch a prebuilt ERTS for OTP ≤ 27, and it rejects any Zig but the
  one version it names. Neither is a preference; both are hard ceilings.
- Frontend runs TypeScript 7, Vite 8 (rolldown), React 19, react-markdown 10 and
  Shiki 4.

### Known issues

- A remote write (MCP, or another window) replaces the editor buffer without
  checking for unsaved local edits.
- YAML frontmatter renders as body text; `remark-frontmatter` is not wired in.
- The document tree does not refresh when files change on disk.
- Mermaid's palette is chosen once at initialize, so switching the OS theme while
  the app is open leaves diagrams on the previous theme until reload.
- No create/rename/delete for documents.
- The MCP server is unauthenticated — any local process can reach it on 43118.
