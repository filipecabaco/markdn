# MarkDN

A native markdown and MDX editor for your notes folder. Write on the left, see
it rendered on the right — diagrams, syntax highlighting, and real components
included. Your files stay plain markdown on your disk.

![MarkDN in split view](docs/screenshots/split-view.png)

## Install

**macOS — Homebrew**

```bash
brew tap filipecabaco/markdn https://github.com/filipecabaco/markdn
brew install --cask markdn
```

**macOS and Linux — one line**

```bash
curl -fsSL https://raw.githubusercontent.com/filipecabaco/markdn/main/install.sh | sh
```

MarkDN currently ships unsigned, so the installer clears the macOS quarantine
flag for you — otherwise Gatekeeper refuses to open it.

## What it does

**Split, source, or render.** Three views, one keystroke apart — `1`, `2`, `3`.
The panes scroll together by block, so a three-line diagram and its full-size
render stay side by side.

**Everything markdown, plus the good parts.** Tables, task lists, and
strikethrough. Code fences highlighted properly. ` ```mermaid ` blocks drawn as
real diagrams.

![Rendered diagrams, code, and tables](docs/screenshots/render.png)

**Components that actually render.** Drop an `<Alert>`, `<Callout>`, `<Card>`,
or `<Tabs>` into a document and it appears in the preview as you type. Hit
`Cmd/Ctrl+Shift+C` to pick one from a menu instead of typing JSX by hand.

![Insert a component](docs/screenshots/component-picker.png)

**Your folder, your files.** Point MarkDN at a directory and it browses it.
Nothing is imported, converted, or locked in a database — `Cmd/Ctrl+S` writes
plain text back to the same `.md`, `.markdown`, or `.mdx` file.

**Find anything, run anything.** `Cmd/Ctrl+K` opens one palette over both: it
fuzzy-finds documents anywhere under your root — `dsn` finds
`work/design-notes.md` — and runs every command in the app. Opened with an empty
query it lists what you touched most recently. `>` narrows it to commands only.

**Read it hands-free.** `Cmd/Ctrl+Space` starts auto-scroll, a teleprompter for
the rendered pane. `+` and `-` change the speed while it runs, space pauses and
resumes, escape stops. The arrow keys scroll whenever you press them, in a
session or out of one; auto-scroll holds while you do and picks up again a
moment after you stop, so the two never fight over the page.

**Settings you can read.** `Cmd/Ctrl+,` opens the document root, theme, default
view, text size, scroll speed, and hidden files. They live in one small JSON
file the panel names at the bottom — on macOS
`~/Library/Application Support/app.markdn.desktop/settings.json` — so they can
also be edited by hand or checked into your dotfiles.

**Open to your AI tools.** MarkDN speaks MCP, so Claude and other assistants can
list, read, and write your documents. Edits made by an assistant show up in an
open window immediately.

**Private by default.** Everything runs locally on your machine. Nothing leaves
your computer, and MDX is rendered — never executed.

## Using it

| | |
| --- | --- |
| `Cmd/Ctrl+K` | Find a document, or run a command |
| `Cmd/Ctrl+Shift+P` | Commands only |
| `Cmd/Ctrl+1` `2` `3` | Source, split, render |
| `Cmd/Ctrl+S` | Save |
| `Cmd/Ctrl+Shift+C` | Insert a component |
| `Cmd/Ctrl+,` | Settings |
| `Cmd/Ctrl+Space` | Start, pause, resume auto-scroll |
| `↑` `↓` | Scroll by hand, any time |
| `+` `-` | Auto-scroll faster, slower |
| `Esc` | Stop auto-scroll |

Components available today: `Alert`, `Callout`, `Card`, `Tabs`, `Tab`.

The document root defaults to your home directory. Change it in settings, or pin
it for a launch with `MARKDN_ROOT=~/notes` — an environment root wins over the
setting, and the panel says so rather than offering an edit it cannot make.

## Connecting an AI assistant

Point any MCP client at MarkDN while it is running:

```
http://localhost:43118/mcp
```

It exposes four tools — `list_documents`, `read_document`, `write_document`,
and `list_components`.

## Contributing

Building from source, the desktop packaging, CI, and release process are
documented in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
