import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getSettings,
  readDocument,
  saveDocument,
  saveSettings,
  type Settings,
  type SettingsResponse,
} from "./api";
import { AutoScrollHud } from "./components/AutoScrollHud";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { Editor } from "./components/Editor";
import { FileTree } from "./components/FileTree";
import { MultiBuffer, type MultiBufferHandle } from "./components/MultiBuffer";
import { Preview } from "./components/Preview";
import { SettingsPanel } from "./components/SettingsPanel";
import { SyncRail } from "./components/SyncRail";
import { Wordmark } from "./components/Wordmark";
import { useAutoScroll } from "./hooks/useAutoScroll";
import { useLineOffsets } from "./hooks/useLineOffsets";
import { useLinkedPanes } from "./hooks/useLinkedPanes";
import { useMediaQuery } from "./hooks/useMediaQuery";

type View = "split" | "editor" | "preview";

const VIEWS: { id: View; label: string; key: string }[] = [
  { id: "editor", label: "Source", key: "1" },
  { id: "split", label: "Split", key: "2" },
  { id: "preview", label: "Render", key: "3" },
];

/** Settings written this often would be a file write per keypress. */
const SETTINGS_DEBOUNCE_MS = 500;

const WELCOME = `# MarkDN

Markdown and MDX, served by **Francis** into a native window.

Scroll either pane. They track each other by block, not by percentage, so a
three-line diagram and its 200px render stay aligned.

<Alert type="info" title="Components render live">
  This is an MDX component resolved through the registry. Nothing is evaluated.
</Alert>

\`\`\`mermaid
flowchart LR
  Source --> Francis --> Render
\`\`\`

Press <kbd>Cmd</kbd><kbd>K</kbd> to find a document or run a command.
`;

export function App() {
  const [path, setPath] = useState<string | null>(null);
  const [content, setContent] = useState(WELCOME);
  const [saved, setSaved] = useState(true);
  const [requestedView, setView] = useState<View>("split");
  const [status, setStatus] = useState<string | null>(null);
  const [config, setConfig] = useState<SettingsResponse | null>(null);
  const [palette, setPalette] = useState<null | "all" | "commands">(null);
  const [showSettings, setShowSettings] = useState(false);
  const [picking, setPicking] = useState(false);
  const [searching, setSearching] = useState(false);
  // Bumped when the root moves, to throw away a tree that describes the old one.
  const [treeGeneration, setTreeGeneration] = useState(0);
  const socket = useRef<WebSocket | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const multibuffer = useRef<MultiBufferHandle>(null);

  // Below this, two panes plus the rail leave each side too narrow to read, so
  // split is withdrawn rather than offered and then not honoured. The control is
  // disabled in the same breath, so it never claims a mode that is not showing.
  const canSplit = useMediaQuery("(min-width: 760px)");
  const view = canSplit || requestedView !== "split" ? requestedView : "preview";

  const lineOffsets = useLineOffsets(textareaRef, content);
  const linked = useLinkedPanes({
    editorRef: textareaRef,
    previewRef,
    lineOffsets,
    content,
    enabled: view === "split",
  });

  const lineCount = useMemo(() => content.split("\n").length, [content]);
  const root = config?.root ?? null;

  // Shortened from the left: the tail of a path is the part that identifies it,
  // and CSS ellipsis only truncates the other end.
  const rootLabel = useMemo(() => {
    if (!root) return "…";
    const parts = root.split("/").filter(Boolean);
    return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : root;
  }, [root]);

  // --- Settings ------------------------------------------------------------

  const settingsTimer = useRef<number | null>(null);

  useEffect(() => {
    getSettings()
      .then((result) => {
        setConfig(result);
        setView(result.settings.defaultView);
      })
      .catch((error: Error) => setStatus(error.message));
  }, []);

  // The palette and the HUD change settings far faster than they should be
  // written to disk, so the UI takes the new value immediately and the file
  // catches up once the user stops moving the slider.
  const updateSettings = useCallback(
    (patch: Partial<Settings>, debounce = false): Promise<void> => {
      setConfig((current) =>
        current ? { ...current, settings: { ...current.settings, ...patch } } : current,
      );

      const write = () =>
        saveSettings(patch).then((result) => {
          setConfig((current) => {
            // A root change invalidates the open document and the whole tree,
            // since every path in the UI is relative to it.
            if (current && current.root !== result.root) {
              setPath(null);
              setTreeGeneration((generation) => generation + 1);
            }
            return result;
          });
        });

      if (!debounce) return write();

      if (settingsTimer.current !== null) window.clearTimeout(settingsTimer.current);
      settingsTimer.current = window.setTimeout(() => {
        settingsTimer.current = null;
        write().catch((error: Error) => setStatus(error.message));
      }, SETTINGS_DEBOUNCE_MS);

      return Promise.resolve();
    },
    [],
  );

  // Theme and text size are applied to the document element rather than passed
  // down as props: they are ambient, and the CSS already reads them from :root.
  useEffect(() => {
    const theme = config?.settings.theme ?? "system";
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [config?.settings.theme]);

  useEffect(() => {
    const size = config?.settings.editorFontSize;
    document.documentElement.style.setProperty(
      "--editor-font-size",
      size ? `${size}px` : "var(--t-base)",
    );
  }, [config?.settings.editorFontSize]);

  // --- Document ------------------------------------------------------------

  // One socket for the window's lifetime. Another window (or the MCP server)
  // saving the open document pushes a notification down it, and the document is
  // re-read so the two views cannot drift apart.
  useEffect(() => {
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    const ws = new WebSocket(url);
    socket.current = ws;

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        if (message.type === "saved" && message.path === path) {
          readDocument(message.path).then((result) => {
            setContent(result.contents);
            setSaved(true);
          });
        }
      } catch {
        // Not a message this client understands; nothing to do.
      }
    };

    return () => ws.close();
  }, [path]);

  const open = useCallback((next: string) => {
    readDocument(next)
      .then((result) => {
        setPath(result.path);
        setContent(result.contents);
        setSaved(true);
        setStatus(null);
      })
      .catch((error: Error) => setStatus(error.message));
  }, []);

  const save = useCallback(() => {
    // While the multibuffer is up it owns the edits on screen, and ⌘S means the
    // same thing there: write everything that was changed.
    if (searching) {
      multibuffer.current?.saveAll();
      return;
    }

    if (!path) {
      setStatus("No file open — nothing to save.");
      return;
    }

    saveDocument(path, content)
      .then(() => {
        setSaved(true);
        setStatus(null);
        socket.current?.send(JSON.stringify({ type: "saved", path }));
      })
      .catch((error: Error) => setStatus(error.message));
  }, [content, path, searching]);

  const reload = useCallback(() => {
    if (path) open(path);
  }, [open, path]);

  /**
   * Writes one document on the multibuffer's behalf.
   *
   * Refuses to write over the open document while it has unsaved edits of its
   * own: two working copies of one file, and this would silently pick the one
   * the user is not looking at.
   */
  const saveFromSearch = useCallback(
    (target: string, contents: string) => {
      if (target === path && !saved) {
        return Promise.reject(
          new Error(`${target} is open with unsaved changes — save or reload it first.`),
        );
      }

      return saveDocument(target, contents).then(() => {
        socket.current?.send(JSON.stringify({ type: "saved", path: target }));

        if (target === path) {
          setContent(contents);
          setSaved(true);
        }
      });
    },
    [path, saved],
  );

  // --- Auto-scroll ---------------------------------------------------------

  // Whichever pane is actually showing the document is the one that scrolls; in
  // split view that is the render, which is the side people read.
  const getScroller = useCallback(
    () => (view === "editor" ? textareaRef.current : previewRef.current),
    [view],
  );

  const autoScroll = useAutoScroll({
    getScroller,
    speed: config?.settings.autoScrollSpeed ?? 40,
    onSpeedChange: (speed) => void updateSettings({ autoScrollSpeed: speed }, true),
  });

  // --- Commands ------------------------------------------------------------

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: "document.save",
        section: "Document",
        title: "Save document",
        hint: "⌘S",
        run: save,
      },
      {
        id: "document.reload",
        section: "Document",
        title: "Reload document from disk",
        run: reload,
      },
      {
        id: "document.search",
        section: "Document",
        title: "Search across documents…",
        hint: "⌘⇧F",
        run: () => setSearching(true),
      },
      {
        id: "document.component",
        section: "Document",
        title: "Insert component…",
        hint: "⌘⇧C",
        run: () => {
          setView((current) => (current === "preview" ? "split" : current));
          setPicking(true);
        },
      },
      {
        id: "reading.autoscroll",
        section: "Reading",
        title: !autoScroll.active
          ? "Start auto-scroll"
          : autoScroll.paused
            ? "Resume auto-scroll"
            : "Pause auto-scroll",
        hint: "⌘Space",
        run: autoScroll.toggle,
      },
      {
        id: "reading.stop",
        section: "Reading",
        title: "Stop auto-scroll",
        hint: "esc",
        run: autoScroll.stop,
      },
      {
        id: "reading.faster",
        section: "Reading",
        title: "Auto-scroll faster",
        hint: "+",
        run: autoScroll.faster,
      },
      {
        id: "reading.slower",
        section: "Reading",
        title: "Auto-scroll slower",
        hint: "−",
        run: autoScroll.slower,
      },
    ];

    for (const mode of VIEWS) {
      list.push({
        id: `view.${mode.id}`,
        section: "View",
        title: `${mode.label} view`,
        hint: `⌘${mode.key}`,
        run: () => setView(mode.id),
      });
    }

    list.push(
      {
        id: "settings.open",
        section: "Settings",
        title: "Open settings…",
        hint: "⌘,",
        run: () => setShowSettings(true),
      },
      {
        id: "settings.theme",
        section: "Settings",
        title: "Cycle theme (system, light, dark)",
        run: () => {
          const order = ["system", "light", "dark"] as const;
          const current = config?.settings.theme ?? "system";
          const next = order[(order.indexOf(current) + 1) % order.length];
          void updateSettings({ theme: next });
        },
      },
      {
        id: "settings.hidden",
        section: "Settings",
        title: config?.settings.showHiddenFiles ? "Hide hidden files" : "Show hidden files",
        run: () => {
          void updateSettings({ showHiddenFiles: !config?.settings.showHiddenFiles });
          setTreeGeneration((generation) => generation + 1);
        },
      },
    );

    return list;
  }, [autoScroll, config?.settings, reload, save, updateSettings]);

  // --- Shortcuts -----------------------------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;

      const key = event.key.toLowerCase();

      if (key === "k" && !event.shiftKey) {
        event.preventDefault();
        setPalette("all");
      } else if (key === "p" && event.shiftKey) {
        event.preventDefault();
        setPalette("commands");
      } else if (key === ",") {
        event.preventDefault();
        setShowSettings(true);
      } else if (key === "s" && !event.shiftKey) {
        // Owned here rather than by the editor so it still saves in render view,
        // where the editor is not mounted at all.
        event.preventDefault();
        save();
      } else if (key === "f" && event.shiftKey) {
        event.preventDefault();
        setSearching(true);
      } else if (key === "c" && event.shiftKey) {
        event.preventDefault();
        setView((current) => (current === "preview" ? "split" : current));
        setPicking(true);
      } else if (!event.shiftKey) {
        // The panes are behind the multibuffer, so switching them would change a
        // mode nothing on screen is in. The control is disabled for the same
        // reason.
        const match = VIEWS.find((mode) => mode.key === event.key);
        if (!match || searching) return;
        event.preventDefault();
        setView(match.id);
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [save, searching]);

  return (
    <div className="app">
      {/* The desktop shell hides the native title bar, so this header is one:
          a mousedown on the bar itself (not on a control) drags the window. */}
      <header className="app__header" data-tauri-drag-region>
        <Wordmark />

        <div className="app__doc" data-tauri-drag-region>
          <span className="app__path">{path ?? "untitled"}</span>
          <span
            className={`app__state${saved ? "" : " is-dirty"}`}
            title={saved ? "Saved" : "Unsaved changes"}
          >
            {saved ? "saved" : "edited"}
          </span>
        </div>

        <div className="segmented" role="group" aria-label="View">
          {VIEWS.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`segmented__item${view === mode.id ? " is-active" : ""}`}
              aria-pressed={view === mode.id}
              disabled={searching || (mode.id === "split" && !canSplit)}
              title={
                searching
                  ? "Close the search to change view"
                  : mode.id === "split" && !canSplit
                    ? "Window too narrow for split view"
                    : undefined
              }
              onClick={() => setView(mode.id)}
            >
              {mode.label}
              <kbd className="segmented__key">{mode.key}</kbd>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="button button--quiet"
          onClick={() => setShowSettings(true)}
          title="Settings (⌘,)"
          aria-label="Settings"
        >
          Settings
        </button>

        <button type="button" className="button" onClick={save} disabled={!path || saved}>
          Save
          <kbd className="button__key">⌘S</kbd>
        </button>
      </header>

      {status && (
        <div className="banner" role="status">
          <span className="banner__dot" />
          {status}
          <button type="button" className="banner__dismiss" onClick={() => setStatus(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="app__body">
        <aside className="sidebar">
          <div className="sidebar__label">
            <span>Root</span>
            <span className="sidebar__root" title={root ?? ""}>
              {rootLabel}
            </span>
          </div>

          {/* A button dressed as a field: the palette is the search surface, and
              a real input here would be a second one that behaves differently. */}
          <button type="button" className="sidebar__search" onClick={() => setPalette("all")}>
            <span>Find a document…</span>
            <kbd>⌘K</kbd>
          </button>

          <button
            type="button"
            className={`sidebar__search${searching ? " is-active" : ""}`}
            onClick={() => setSearching(true)}
          >
            <span>Search in documents…</span>
            <kbd>⌘⇧F</kbd>
          </button>

          <FileTree key={treeGeneration} path="." selected={path} onSelect={open} />
        </aside>

        {searching && (
          <MultiBuffer
            ref={multibuffer}
            onSave={saveFromSearch}
            onOpen={(next) => {
              open(next);
              setSearching(false);
            }}
            onClose={() => setSearching(false)}
          />
        )}

        <main className={`panes panes--${view}`} hidden={searching}>
          {view !== "preview" && (
            <Editor
              value={content}
              textareaRef={textareaRef}
              caretLine={linked.caretLine}
              lineCount={lineCount}
              picking={picking}
              onPickingChange={setPicking}
              onScroll={linked.onEditorScroll}
              onCaretChange={linked.onCaretChange}
              onChange={(next) => {
                setContent(next);
                setSaved(false);
              }}
            />
          )}

          {view === "split" && (
            <SyncRail
              blocks={linked.blocks}
              activeLine={linked.activeLine}
              scrollerRef={previewRef}
            />
          )}

          {view !== "editor" && (
            <Preview
              content={content}
              documentPath={path}
              scrollerRef={previewRef}
              onScroll={linked.onPreviewScroll}
              activeLine={view === "split" ? linked.activeLine : null}
            />
          )}
        </main>
      </div>

      <AutoScrollHud autoScroll={autoScroll} />

      {palette && (
        <CommandPalette
          commands={commands}
          commandsOnly={palette === "commands"}
          onOpenFile={open}
          onClose={() => setPalette(null)}
        />
      )}

      {showSettings && config && (
        <SettingsPanel
          state={config}
          onChange={updateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
