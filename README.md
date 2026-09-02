# MarkDN

**A markdown and MDX editor that renders the whole document.** Diagrams, code,
components. Your folder, your files, on your machine.

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

## What you get

**Source and render, side by side and in step.** Scroll either pane and the
other follows by block, not by percentage, so a three-line diagram and its
full-size render stay together. One keystroke switches to source only or render
only.

**The parts other previewers drop.** Tables, task lists, footnotes.
Syntax-highlighted code. ` ```mermaid ` fences drawn as real diagrams. And MDX
components — `<Alert>`, `<Callout>`, `<Card>`, `<Tabs>` — appearing in the
preview as you type.

![Rendered diagrams, code, and tables](docs/screenshots/render.png)

**Find any document by feel.** `Cmd/Ctrl+K` and type roughly what you remember:
`dsn` finds `work/design-notes.md` three folders down. Open it with no query and
it lists what you touched last.

**Search across every document, and edit what you find.** `Cmd/Ctrl+Shift+F`
searches the whole folder and shows each match with the lines around it — as
editable source, not as a preview. Fix a dozen files in one pass, replace across
all of them at once, and save the lot with one `Cmd/Ctrl+S`. The lines a result
does not show are still there: what gets written back is the document.

**The source pane is highlighted too.** Headings, emphasis, code fences, links
and component tags are coloured as you type, in a plain textarea — so the caret,
the selection, and undo behave exactly the way they do everywhere else on your
machine.

**Every command in the same place.** The same palette runs the app: switch view,
insert a component, change the root, start reading. Type `>` to see only
commands. Nothing hides in a menu you have to go find.

![Insert a component](docs/screenshots/component-picker.png)

**Long documents scroll themselves.** `Cmd/Ctrl+Space` starts a teleprompter for
the rendered pane. `+` and `-` set the pace while it runs, space holds it,
escape ends it. Reach for the arrow keys mid-scroll and it steps aside, then
picks up again a moment after you stop.

**Settings, not preferences.** Root folder, theme, default view, text size,
scroll speed, hidden files. Six things that change how the app behaves, in one
panel, saved in one small file you can also edit by hand.

**Plain files, start to finish.** Nothing is imported, converted, or filed in a
database. `Cmd/Ctrl+S` writes the same `.md`, `.markdown`, or `.mdx` you opened,
in place.

**Your assistant works on the same file you do.** MarkDN speaks MCP, so Claude
and other agents can list, read, and write the documents you have open — and the
window updates the moment they do.

**Private by default.** Everything runs on your machine. Nothing leaves it, and
MDX is rendered, never executed.

## Using it

| | |
| --- | --- |
| `Cmd/Ctrl+K` | Find a document, or run a command |
| `Cmd/Ctrl+Shift+P` | Commands only |
| `Cmd/Ctrl+Shift+F` | Search and edit across documents |
| `Cmd/Ctrl+1` `2` `3` | Source, split, render |
| `Cmd/Ctrl+S` | Save |
| `Cmd/Ctrl+Shift+C` | Insert a component |
| `Cmd/Ctrl+,` | Settings |
| `Cmd/Ctrl+Space` | Start, pause, resume auto-scroll |
| `↑` `↓` | Scroll by hand, any time |
| `+` `-` | Auto-scroll faster, slower |
| `Esc` | Stop auto-scroll |

## Working with an assistant

Point any MCP client at MarkDN while it is running:

```
http://localhost:43118/mcp
```

It can list, read, and write your documents, and ask which components are
available so the MDX it writes is MDX that renders. An assistant editing a file
you have open is visible immediately, in the window, where you can keep or change
it.

## Contributing

Building from source, desktop packaging, CI, and the release process are in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
