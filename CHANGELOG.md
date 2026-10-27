# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases are cut automatically from Conventional Commit prefixes on `main`
(`fix:` patch, `feat:` minor, `type!:` / `BREAKING CHANGE` major). The version in
`mix.exs` and `src-tauri/tauri.conf.json` is a placeholder — the release workflow
stamps the resolved number into both before building.

## [Unreleased]

### Changed

- **One packager for the desktop and iOS.** The desktop backend is packed by
  ampoule instead of Burrito: one binary running the BEAM as WebAssembly, on
  OTP 28 like the iOS build. No Zig, nothing unpacked on first launch, and no
  stale backend left behind by an earlier build. Settings, the documents root
  and Move to Trash work as before; the backend log is now in
  `~/Library/Logs/MarkDN/`.

### Added

- **The window comes back where you were.** The open document, the view and any
  unsaved edits are kept in `session.json` beside the settings, and a window that
  loads — after iOS reclaims a suspended app or ends it, or after a restart —
  opens on them, saying when it kept unsaved changes. Backed by `GET`/`POST
  /api/session`; browser storage could not do it, since the window's origin
  changes port on every launch.
- **Creating documents.** `Cmd/Ctrl+N`, a sidebar "New document" field and a
  palette command name a document beside the open one, creating parent folders.
  `Cmd/Ctrl+S` on an untitled buffer names it and saves what was typed. Backed by
  `POST /api/document/new`, which refuses (409) rather than overwrite.
- **Context menus.** Right-click a file for Open, New document here, Rename,
  Copy path, Copy relative path and Move to Trash; a folder for New document here
  and the copies; empty sidebar space for New document. The webview's own menu
  (whose Reload dropped unsaved edits) now appears only on text fields and
  selected text. Rename and Move to Trash are also palette commands.
- **Rename and Trash.** `POST /api/document/rename` (refuses to overwrite) and
  `POST /api/document/trash`, which moves the file to the system Trash
  (`/usr/bin/trash` on macOS 15+, Finder on older macOS, `gio trash` on Linux) —
  never a permanent delete.
- **Unsaved edits are never dropped silently.** Opening another document, starting
  a new one, reloading, or a save arriving from another window or an MCP client
  while the open document has unsaved changes now asks first, in the status strip:
  save, discard, or keep editing; reload theirs or keep yours. A clean document
  that changes on disk is reloaded with a notice.
- The file tree re-lists in place, without collapsing, when a file is created
  here, by another window, or by an MCP write.
- **Collapsible sidebar.** A toggle at the left of the header, `Cmd/Ctrl+B`, or
  the palette hides the sidebar so the panes take the full width. The choice is
  kept in settings (`sidebarCollapsed`) — browser storage would forget it, since
  the desktop window's origin changes port each launch. New and Rename reopen it,
  since their name field lives there.
- **Copy for Notion.** A palette command (open document, unsaved edits
  included) and a file context-menu item put the document on the clipboard as
  HTML Notion turns into blocks, with the markdown source as the plain-text
  half. Rendered through the preview's own remark pipeline with Notion-shaped
  renderers: Alert/Callout → quote with a bold title, Card → heading, Tabs →
  every tab, code and mermaid → code blocks with their language, local images →
  a line naming them (Notion cannot fetch from localhost). The renderer is
  preloaded so copying the open document happens synchronously inside the
  gesture, which WebKit requires of clipboard writes.
- **A loading screen while the backend starts.** The desktop window opens on a
  bundled page — the mark, "Starting…", and after a few seconds a note that a
  first launch unpacks the runtime — instead of a blank or failed page on a port
  nothing serves yet. A backend that exits or never answers is reported on the
  same page, with what happened and the actual log path.

### Changed

- **Keyboard shortcuts follow VS Code.** `Cmd/Ctrl+P` finds a document (was
  `Cmd/Ctrl+K`); `Cmd/Ctrl+B` toggles the sidebar; `Cmd/Ctrl+Shift+V` toggles the
  preview and `Cmd/Ctrl+K V` opens it to the side — `Cmd/Ctrl+K` is now a chord
  prefix, announced in the status strip while it waits. In the tree, `F2`
  renames, `Cmd+Backspace` (or `Delete`) moves to the Trash, and `Cmd+Alt+C` /
  `Cmd+Alt+Shift+C` copy the path; the context menu shows the same keys.
  `Ctrl+Shift+M` toggles whether Tab moves focus out of the editor. The command
  palette, search, new, save, settings and `Shift+F10` already matched.
  `Cmd/Ctrl+1`–`3`, insert-component and auto-scroll keys have no VS Code
  counterpart and are unchanged.

### Fixed

- Code blocks drew a box around every line at a shrunken size, and Card titles
  carried a 28px empty band: document typography leaked into components. Preview
  prose rules now sit under `:where(.preview)`, at zero specificity.
- `.MD` and other upper-case extensions were rejected.
- MCP save notifications carried the path as the agent wrote it, so
  `./notes/a.md` never matched the open `notes/a.md`.
- Missing images show "Image not found: path" instead of a broken-image glyph;
  task lists lose the stray bullet beside their checkbox.

### Security

- A symlink inside the root could read or write outside it. Paths are now
  resolved through every symlink — including `..` inside a link's target, the way
  the kernel follows it — before the containment check; link loops are refused.
- Removed the `shell:allow-execute` capability: the page never used it, and with
  `remote: http://localhost:*` it let any local page start another backend.
- Patched transitive advisories: mint 1.11.0 (two HIGH), igniter 0.8.5, and
  dompurify 3.4.17 (one CRITICAL, one HIGH, via mermaid).

### Performance

- Typing in a 4,000-line document in split view went from ~224ms to ~48ms per
  keystroke (Chrome, measured with the Event Timing API). The source highlight
  layer and the line-offset mirror now patch only the lines that changed; the MDX
  preview element is memoised, so caret moves no longer re-parse the document;
  and the preview paces itself to its own render cost — live on every key for
  ordinary notes, catching up on a pause for long ones.
- Documents containing only a mermaid diagram no longer load the 600kB Shiki
  regex engine.
- `priv/static` is cleared on every build: stale bundles had grown it to 114 MB,
  all of it copied into the desktop release. It is now 15 MB.

### Accessibility

- The editor no longer traps keyboard focus: Shift+Tab leaves backwards, Escape
  then Tab leaves forwards, and Tab-to-indent now uses native editing so undo
  works.
- The file tree is an ARIA tree (one Tab stop, arrows, Enter, Shift+F10 for the
  row's menu); MDX `Tabs` follow the tabs pattern; palette, settings and the
  component picker are modal dialogs that contain and restore focus; the palette
  is a combobox with `aria-activedescendant`.
- Key hints met 2.2:1 and Shiki's keyword colour 3.7:1; both now pass AA. Tree
  rows meet the 24px target size (WCAG 2.2, 2.5.8). Lighthouse accessibility: 100.
- Alerts use drawn glyphs instead of emoji, and warning (new `--caution` amber)
  is now distinct from error.

### Dependencies

- Francis 0.4.0, bandit 1.14, React 19.3, Vite 8.3, Vitest 5, Shiki 4.5 and the
  rest at latest; Tauri crates updated within range. ex_tauri is held at 0.2.x
  (0.4 needs a regenerated Rust shell) and mermaid at 11.x (12 requires Safari
  17.4+ and re-lays out every diagram).

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
