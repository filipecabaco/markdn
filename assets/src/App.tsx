import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { health, readDocument, saveDocument } from "./api";
import { Editor } from "./components/Editor";
import { FileTree } from "./components/FileTree";
import { Preview } from "./components/Preview";
import { SyncRail } from "./components/SyncRail";
import { Wordmark } from "./components/Wordmark";
import { useLineOffsets } from "./hooks/useLineOffsets";
import { useLinkedPanes } from "./hooks/useLinkedPanes";
import { useMediaQuery } from "./hooks/useMediaQuery";

type View = "split" | "editor" | "preview";

const VIEWS: { id: View; label: string; key: string }[] = [
  { id: "editor", label: "Source", key: "1" },
  { id: "split", label: "Split", key: "2" },
  { id: "preview", label: "Render", key: "3" },
];

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

Press <kbd>Cmd</kbd><kbd>Shift</kbd><kbd>C</kbd> to insert a component.
`;

export function App() {
  const [path, setPath] = useState<string | null>(null);
  const [content, setContent] = useState(WELCOME);
  const [saved, setSaved] = useState(true);
  const [requestedView, setView] = useState<View>("split");
  const [root, setRoot] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const socket = useRef<WebSocket | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

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

  // Shortened from the left: the tail of a path is the part that identifies it,
  // and CSS ellipsis only truncates the other end.
  const rootLabel = useMemo(() => {
    if (!root) return "…";
    const parts = root.split("/").filter(Boolean);
    return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : root;
  }, [root]);

  useEffect(() => {
    health()
      .then((result) => setRoot(result.root))
      .catch((error: Error) => setStatus(error.message));
  }, []);

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
  }, [content, path]);

  // Cmd/Ctrl+1..3 switches panes, matching the numbering in the view control.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey) return;
      const match = VIEWS.find((v) => v.key === event.key);
      if (!match) return;
      event.preventDefault();
      setView(match.id);
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <header className="app__header">
        <Wordmark />

        <div className="app__doc">
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
              disabled={mode.id === "split" && !canSplit}
              title={
                mode.id === "split" && !canSplit ? "Window too narrow for split view" : undefined
              }
              onClick={() => setView(mode.id)}
            >
              {mode.label}
              <kbd className="segmented__key">{mode.key}</kbd>
            </button>
          ))}
        </div>

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
          <FileTree path="." selected={path} onSelect={open} />
        </aside>

        <main className={`panes panes--${view}`}>
          {view !== "preview" && (
            <Editor
              value={content}
              textareaRef={textareaRef}
              caretLine={linked.caretLine}
              lineCount={lineCount}
              onScroll={linked.onEditorScroll}
              onCaretChange={linked.onCaretChange}
              onChange={(next) => {
                setContent(next);
                setSaved(false);
              }}
              onSave={save}
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
    </div>
  );
}
