import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createDocument,
  getSession,
  getSettings,
  readDocument,
  renameDocument,
  trashDocument,
  type Entry,
  saveDocument,
  saveSession,
  saveSettings,
  type Settings,
  type SettingsResponse,
} from "./api";
import { AutoScrollHud } from "./components/AutoScrollHud";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { Editor } from "./components/Editor";
import { FileTree, type EntryCommand } from "./components/FileTree";
import { MultiBuffer, type MultiBufferHandle } from "./components/MultiBuffer";
import { ContextMenu, type MenuItem } from "./components/ContextMenu";
import { DecisionBar, type Decision } from "./components/DecisionBar";
import { PathField } from "./components/PathField";
import { Preview } from "./components/Preview";
import { SettingsPanel } from "./components/SettingsPanel";
import { SyncRail } from "./components/SyncRail";
import { DocumentLine } from "./components/DocumentLine";
import { TabBar, type PhoneTab } from "./components/TabBar";
import { Wordmark } from "./components/Wordmark";
import { useAutoScroll } from "./hooks/useAutoScroll";
import { useLineOffsets } from "./hooks/useLineOffsets";
import { useLinkedPanes } from "./hooks/useLinkedPanes";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { usePacedValue } from "./hooks/usePacedValue";
import { copyRich, notionHtml, notionHtmlNow, preloadNotionExport } from "./notionExport";
import { changedRange, headingsOf, lineFor, lineName, stationName, stationsIn } from "./lines";

type View = "split" | "editor" | "preview";

type Field =
  | { mode: "create"; initial: string; contents: string }
  | { mode: "rename"; from: string };

/** The directory part of a root-relative path, with its trailing slash. */
function parentOf(path: string | null): string {
  return path?.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
}

/**
 * Whether a right-click should get the webview's own menu.
 *
 * Text fields and selected text keep it: Cut, Copy, Paste and spelling are
 * worth having there. Everywhere else it offers Reload, which drops unsaved
 * edits, and little else, so it is withheld.
 */
function wantsNativeMenu(target: EventTarget | null): boolean {
  if (target instanceof HTMLElement && target.closest("textarea, input, [contenteditable]")) {
    return true;
  }
  return (window.getSelection()?.toString() ?? "") !== "";
}

// `key` is the ⌘-digit that picks the view directly; `chord` is the VS Code way
// to reach it, shown in the palette where there is one.
const VIEWS: { id: View; label: string; key: string; chord?: string }[] = [
  { id: "editor", label: "Source", key: "1" },
  { id: "split", label: "Split", key: "2", chord: "⌘K V" },
  { id: "preview", label: "Render", key: "3", chord: "⇧⌘V" },
];

/** Settings written this often would be a file write per keypress. */
const SETTINGS_DEBOUNCE_MS = 500;
// Unsaved edits are kept for the next window once typing pauses this long.
const DRAFT_DEBOUNCE_MS = 800;

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

Press <kbd>Cmd</kbd><kbd>P</kbd> to find a document, or <kbd>Cmd</kbd><kbd>Shift</kbd><kbd>P</kbd> to run a command.
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
  // Bumped when a file may have appeared, to re-list the tree without collapsing it.
  const [treeRevision, setTreeRevision] = useState(0);
  // The sidebar's path field: naming a new document (which starts empty for New,
  // or with the untitled buffer for a first Save), or renaming one.
  const [field, setField] = useState<Field | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; entry: Entry | null } | null>(null);
  const socket = useRef<WebSocket | null>(null);
  // Read by the socket's handler, so the socket need not reconnect on every open.
  const pathRef = useRef<string | null>(null);
  pathRef.current = path;
  // Likewise for the guard below, which runs from the socket and from callbacks
  // created before the latest keystroke.
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const contentRef = useRef(content);
  contentRef.current = content;
  // A question for the user, shown in place of the status strip.
  const [decision, setDecision] = useState<Decision | null>(null);
  // Stations an agent's write changed, by heading line: service alerts on the
  // document's line, each cleared when the reader goes there.
  const [alerts, setAlerts] = useState<Set<number>>(() => new Set());

  // The open document went away underneath the editor. Its text is kept as an
  // unsaved, untitled buffer, so ⌘S can still put it somewhere.
  const forget = useCallback(() => {
    setPath(null);
    setSaved(false);
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const multibuffer = useRef<MultiBufferHandle>(null);

  // Below this, two panes plus the rail leave each side too narrow to read, so
  // split is withdrawn rather than offered and then not honoured. The control is
  // disabled in the same breath, so it never claims a mode that is not showing.
  const canSplit = useMediaQuery("(min-width: 760px)");
  const view = canSplit || requestedView !== "split" ? requestedView : "preview";

  // iPhone: read first. One pane at a time, the app's places in a tab bar, and
  // editing a tap away in the top bar beside the document it acts on.
  const phone = useMediaQuery("(max-width: 599px)");
  const [phoneTab, setPhoneTab] = useState<PhoneTab>("read");

  // iPad portrait and split screen: the rail slides over the document rather
  // than squeezing it, closed until asked for, as iPadOS sidebars do. The saved
  // collapsed setting governs the wide layouts only.
  const compact = useMediaQuery("(min-width: 600px) and (max-width: 1023px)");
  const [railOpen, setRailOpen] = useState(false);

  const lineOffsets = useLineOffsets(textareaRef, content, view === "split");
  // What the preview shows: the document itself while rendering it is cheap,
  // held back while typing when it is not (see usePacedValue).
  const previewCost = useRef(0);
  const previewContent = usePacedValue(content, path, previewCost);

  const linked = useLinkedPanes({
    editorRef: textareaRef,
    previewRef,
    lineOffsets,
    content: previewContent,
    enabled: view === "split",
  });

  const lineCount = useMemo(() => content.split("\n").length, [content]);

  // --- The document's line ------------------------------------------------

  const headings = useMemo(() => headingsOf(previewContent), [previewContent]);
  const ink = lineFor(path);

  useEffect(() => setAlerts(new Set()), [path]);

  // The station in view: in a rendered pane the last heading scrolled past the
  // top of the pane, in the source alone the heading above the caret.
  const [scrolledStation, setScrolledStation] = useState<number | null>(null);
  useEffect(() => {
    const scroller = previewRef.current;
    if (view === "editor" || !scroller) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      // A pane hidden behind another tab measures every block at zero: there is
      // no position to read, so the last one read stands.
      if (scroller.clientHeight === 0) return;
      const edge = scroller.getBoundingClientRect().top + 72;
      let found: number | null = headings[0]?.line ?? null;
      for (const heading of headings) {
        const block = scroller.querySelector(`[data-line="${heading.line}"]`);
        if (!block || block.getBoundingClientRect().top > edge) break;
        found = heading.line;
      }
      setScrolledStation(found);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [view, headings, phoneTab]);

  const caretStation = useMemo(() => {
    let found: number | null = headings[0]?.line ?? null;
    for (const heading of headings) {
      if (heading.line > linked.caretLine) break;
      found = heading.line;
    }
    return found;
  }, [headings, linked.caretLine]);

  const currentStation = view === "editor" ? caretStation : scrolledStation;

  const jumpTo = useCallback(
    (line: number) => {
      setAlerts((current) => {
        if (!current.has(line)) return current;
        const next = new Set(current);
        next.delete(line);
        return next;
      });
      setPhoneTab("read");
      setRailOpen(false);

      // Smooth only where nothing else moves with it: in split view each pane's
      // scroll drives the other, and that sync cancels an animated scroll after
      // its first frame, so the jump there is instant and the panes follow once.
      const behavior: ScrollBehavior =
        view !== "preview" || window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth";

      // After the tab switch has shown the panes again.
      requestAnimationFrame(() => {
        const scroller = previewRef.current;
        const block = scroller?.querySelector<HTMLElement>(`[data-line="${line}"]`);
        if (view !== "editor" && scroller && block) {
          const top =
            scroller.scrollTop +
            block.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top -
            16;
          scroller.scrollTo({ top, behavior });
          return;
        }

        const textarea = textareaRef.current;
        if (!textarea) return;
        const offset = contentRef.current.split("\n").slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
        const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
        textarea.setSelectionRange(offset, offset);
        textarea.scrollTo({ top: Math.max(0, (line - 2) * lineHeight), behavior });
      });
    },
    [view],
  );

  // Off the Read tab the bar names the place, as an iOS navigation bar does.
  const phoneTitle = !phone
    ? null
    : searching
      ? "Search"
      : phoneTab === "documents"
        ? "Documents"
        : phoneTab === "outline"
          ? "Outline"
          : null;

  const onTab = useCallback((tab: PhoneTab) => {
    if (tab === "search") {
      setSearching(true);
      return;
    }
    setSearching(false);
    setPhoneTab(tab);
  }, []);
  const root = config?.root ?? null;

  // Shortened from the left: the tail of a path is the part that identifies it,
  // and CSS ellipsis only truncates the other end.
  const rootLabel = useMemo(() => {
    if (!root) return "…";
    // On iPhone and iPad the root is the app's own Documents folder, whose path
    // runs through a container UUID nobody recognises; name it as Files does.
    if (/\/Data\/Application\/[^/]+\/Documents\/?$/.test(root)) return "On this device · Documents";
    const parts = root.split("/").filter(Boolean);
    return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : root;
  }, [root]);

  // --- Settings ------------------------------------------------------------

  const settingsTimer = useRef<number | null>(null);

  useEffect(() => {
    getSettings()
      .then((result) => {
        setConfig(result);
        // The view the reader left in wins over the default for a new window.
        if (!viewRestored.current) setView(result.settings.defaultView);
      })
      .catch((error: Error) => setStatus(error.message));
  }, []);

  // --- Session -------------------------------------------------------------

  // Where the reader was. A window that reloads — iOS reclaiming a suspended
  // app's web content or ending the app, a restart on the desktop — comes back
  // on the same document, in the same view, with its unsaved edits. Nothing is
  // written back until the stored session has been applied, or the empty window
  // that just loaded would overwrite it.
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const viewRestored = useRef(false);
  // Whether the server holds a draft that a save should now clear.
  const draftStored = useRef(false);

  useEffect(() => {
    const restore = async () => {
      const session = await getSession();
      const draft = session.draft;
      draftStored.current = draft !== null;

      if (session.view) {
        viewRestored.current = true;
        setView(session.view);
      }

      const opened = session.document
        ? await readDocument(session.document).catch(() => null)
        : null;

      if (opened && draft?.path === opened.path && draft.contents !== opened.contents) {
        setPath(opened.path);
        setContent(draft.contents);
        setSaved(false);
        setStatus(`Your unsaved changes to ${opened.path} were kept.`);
      } else if (opened) {
        setPath(opened.path);
        setContent(opened.contents);
        setSaved(true);
      } else if (draft && (draft.path === null || draft.path === session.document)) {
        // Untitled text, or edits to a document that has since gone: kept as an
        // untitled buffer, the way a document deleted under the editor is.
        setContent(draft.contents);
        setSaved(false);
      }
    };

    restore()
      .catch(() => {})
      .finally(() => setSessionLoaded(true));
  }, []);

  useEffect(() => {
    if (!sessionLoaded) return;
    saveSession({ document: path, view: requestedView }).catch(() => {});
  }, [sessionLoaded, path, requestedView]);

  useEffect(() => {
    if (!sessionLoaded) return;

    if (saved) {
      if (draftStored.current) {
        draftStored.current = false;
        saveSession({ draft: null }).catch(() => {});
      }
      return;
    }

    const timer = window.setTimeout(() => {
      draftStored.current = true;
      saveSession({ draft: { path, contents: content } }).catch(() => {});
    }, DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [sessionLoaded, saved, path, content]);

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
  // re-read so the two views cannot drift apart. Any write may have added a file
  // (an MCP write creates as readily as it saves), so the tree is re-listed too.
  useEffect(() => {
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    const ws = new WebSocket(url);
    socket.current = ws;

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        if (!["saved", "created", "renamed", "trashed"].includes(message.type)) return;

        setTreeRevision((revision) => revision + 1);

        if (message.type === "saved" && message.path === pathRef.current) {
          const changed: string = message.path;
          const reloadFromDisk = () =>
            readDocument(changed).then((result) => {
              // Whatever changed under the reader is a service alert on the
              // stations it touched, so it can be found without a diff.
              const range = changedRange(contentRef.current, result.contents);
              if (range) setAlerts(stationsIn(headingsOf(result.contents), range));
              setContent(result.contents);
              setSaved(true);
            });

          // Someone else wrote the file under the editor. With nothing unsaved
          // here, take their version and say so; with edits in progress, neither
          // copy is thrown away without the user choosing.
          if (savedRef.current) {
            reloadFromDisk().then(() => setStatus(`${changed} changed on disk and was reloaded.`));
          } else {
            setDecision({
              message: `${changed} changed on disk while you were editing it.`,
              actions: [
                { label: "Reload from disk", run: () => void reloadFromDisk() },
                { label: "Keep my version", run: () => {} },
              ],
            });
          }
        } else if (message.type === "renamed" && message.from === pathRef.current) {
          setPath(message.path);
        } else if (message.type === "trashed" && message.path === pathRef.current) {
          forget();
        }
      } catch {
        // Not a message this client understands; nothing to do.
      }
    };

    return () => ws.close();
  }, [forget]);

  // Development keeps the native menu everywhere, for Inspect Element.
  useEffect(() => {
    if (import.meta.env.DEV) return;

    const onContextMenu = (event: MouseEvent) => {
      if (!wantsNativeMenu(event.target)) event.preventDefault();
    };

    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  const load = useCallback((next: string) => {
    readDocument(next)
      .then((result) => {
        setPath(result.path);
        setContent(result.contents);
        setSaved(true);
        setStatus(null);
      })
      .catch((error: Error) => setStatus(error.message));
  }, []);

  /** Writes the open document as it is on screen right now. */
  const persist = useCallback(() => {
    const target = pathRef.current;
    if (!target) return Promise.reject(new Error("No file open — nothing to save."));

    return saveDocument(target, contentRef.current).then(() => {
      setSaved(true);
      setStatus(null);
      socket.current?.send(JSON.stringify({ type: "saved", path: target }));
    });
  }, []);

  /**
   * Opens the new-document field. Prefilled with the open document's directory
   * unless told where: a new note usually belongs next to the one being read.
   */
  const startNew = useCallback(
    (contents = "", directory?: string) => {
      setField({ mode: "create", initial: directory ?? parentOf(path), contents });
    },
    [path],
  );

  // Collapsed state lives with the settings, not in browser storage: the desktop
  // window's origin changes port on every launch, so storage would forget it.
  const sidebarCollapsed = config?.settings.sidebarCollapsed ?? false;
  const toggleSidebar = useCallback(
    () => void updateSettings({ sidebarCollapsed: !sidebarCollapsed }),
    [sidebarCollapsed, updateSettings],
  );

  // The name field for New and Rename lives in the sidebar. Asking for it with
  // the sidebar hidden brings the sidebar back rather than typing into nothing.
  useEffect(() => {
    if (field && sidebarCollapsed) void updateSettings({ sidebarCollapsed: false });
  }, [field, sidebarCollapsed, updateSettings]);

  /**
   * Runs `proceed` — which replaces the buffer — only once unsaved edits are
   * dealt with. Opening another file used to drop them without a word.
   */
  const guard = useCallback(
    (verb: string, proceed: () => void) => {
      if (savedRef.current) {
        proceed();
        return;
      }

      const current = pathRef.current;
      setDecision({
        message: `Unsaved changes in ${current ?? "the untitled document"}.`,
        actions: [
          current
            ? {
                label: `Save and ${verb}`,
                run: () => {
                  persist()
                    .then(proceed)
                    .catch((error: Error) => setStatus(error.message));
                },
              }
            : // Untitled text has nowhere to be saved until it has a name.
              { label: "Name and save", run: () => startNew(contentRef.current) },
          { label: `Discard and ${verb}`, run: proceed },
          { label: "Keep editing", run: () => {} },
        ],
      });
    },
    [persist, startNew],
  );

  const open = useCallback(
    (next: string) => {
      // The document already on screen, with edits: re-reading it is the one
      // thing that would lose them, and nothing was asked for.
      if (next === pathRef.current && !savedRef.current) return;
      setPhoneTab("read");
      setRailOpen(false);
      guard("open", () => load(next));
    },
    [guard, load],
  );

  const requestNew = useCallback(
    (directory?: string) => guard("start new", () => startNew("", directory)),
    [guard, startNew],
  );

  const create = useCallback(
    (target: string) => {
      const contents = field?.mode === "create" ? field.contents : "";

      return createDocument(target, contents).then((result) => {
        setPath(result.path);
        setContent(contents);
        setSaved(true);
        setStatus(null);
        setField(null);
        setTreeRevision((revision) => revision + 1);
        socket.current?.send(JSON.stringify({ type: "created", path: result.path }));
      });
    },
    [field],
  );

  // The open document's buffer survives a rename untouched, edits included: only
  // the name it will be saved under changes.
  const rename = useCallback(
    (target: string) => {
      if (field?.mode !== "rename") return Promise.resolve();
      const from = field.from;

      return renameDocument(from, target).then((result) => {
        if (pathRef.current === from) setPath(result.path);
        setField(null);
        setStatus(null);
        setTreeRevision((revision) => revision + 1);
        socket.current?.send(JSON.stringify({ type: "renamed", from, path: result.path }));
      });
    },
    [field],
  );

  const trash = useCallback((target: string) => {
    trashDocument(target)
      .then(() => {
        if (pathRef.current === target) forget();
        setStatus(`Moved ${target} to the Trash.`);
        setTreeRevision((revision) => revision + 1);
        socket.current?.send(JSON.stringify({ type: "trashed", path: target }));
      })
      .catch((error: Error) => setStatus(error.message));
  }, []);

  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => setStatus("Could not copy to the clipboard."));
  }, []);

  /**
   * Copies a document so it pastes into Notion as real blocks — HTML for
   * Notion, the markdown source as the plain-text fallback. The open document
   * is copied as it is on screen, unsaved edits included; any other file, as
   * it is on disk.
   */
  const copyForNotion = useCallback((target: string | null) => {
    const name = target ?? pathRef.current ?? "the untitled document";
    const open = target === null || target === pathRef.current;

    // The open document is in hand, so with the renderer preloaded the HTML
    // exists before this handler returns and the copy happens inside the
    // gesture. A file from the tree has to be read first, so it goes as
    // promises the clipboard waits on.
    const html = open ? notionHtmlNow(contentRef.current) : null;
    const copying =
      open && html !== null
        ? copyRich(html, contentRef.current)
        : (() => {
            const source = open
              ? Promise.resolve(contentRef.current)
              : readDocument(target).then((result) => result.contents);
            return copyRich(source.then(notionHtml), source);
          })();

    copying
      .then(() => setStatus(`Copied ${name} for Notion. Paste it into a page.`))
      .catch((error: Error) => setStatus(error.message));
  }, []);

  // Fetch the HTML renderer once the window has settled, so the first copy for
  // Notion can still happen synchronously inside its click.
  useEffect(() => {
    const timer = window.setTimeout(() => void preloadNotionExport(), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  const menuItems = useMemo<MenuItem[]>(() => {
    if (!menu) return [];
    const { entry } = menu;

    if (!entry) return [{ label: "New document…", hint: "⌘N", run: () => requestNew("") }];

    const absolute = root ? `${root.replace(/\/$/, "")}/${entry.path}` : entry.path;
    const copies: MenuItem[] = [
      { label: "Copy path", hint: "⌥⌘C", run: () => copy(absolute) },
      { label: "Copy relative path", hint: "⇧⌥⌘C", run: () => copy(entry.path) },
    ];

    if (entry.type === "directory") {
      return [
        { label: "New document here…", run: () => requestNew(`${entry.path}/`) },
        "separator",
        ...copies,
      ];
    }

    return [
      { label: "Open", run: () => open(entry.path) },
      { label: "New document here…", run: () => requestNew(parentOf(entry.path)) },
      "separator",
      { label: "Rename…", hint: "F2", run: () => setField({ mode: "rename", from: entry.path }) },
      ...copies,
      { label: "Copy for Notion", run: () => copyForNotion(entry.path) },
      "separator",
      { label: "Move to Trash", hint: "⌘⌫", danger: true, run: () => trash(entry.path) },
    ];
  }, [copy, copyForNotion, menu, open, requestNew, root, trash]);

  const closeMenu = useCallback(() => setMenu(null), []);

  // The tree's VS Code explorer keys do what the same menu items do.
  const runEntryCommand = useCallback(
    (entry: Entry, command: EntryCommand) => {
      if (command === "rename") setField({ mode: "rename", from: entry.path });
      else if (command === "trash") trash(entry.path);
      else if (command === "copyRelativePath") copy(entry.path);
      else copy(root ? `${root.replace(/\/$/, "")}/${entry.path}` : entry.path);
    },
    [copy, root, trash],
  );

  const save = useCallback(() => {
    // While the multibuffer is up it owns the edits on screen, and ⌘S means the
    // same thing there: write everything that was changed.
    if (searching) {
      multibuffer.current?.saveAll();
      return;
    }

    // An untitled buffer has nowhere to go yet, so Save names it first — the
    // text typed into it is what the new document starts with.
    if (!path) {
      startNew(saved ? "" : content);
      return;
    }

    persist().catch((error: Error) => setStatus(error.message));
  }, [content, path, persist, saved, searching, startNew]);

  // Reload is asked for, so it is the one place re-reading the open document is
  // right — but with edits on screen it is also a discard, and says so.
  const reload = useCallback(() => {
    if (!path) return;
    if (savedRef.current) {
      load(path);
      return;
    }

    setDecision({
      message: `Reloading ${path} discards your unsaved changes.`,
      actions: [
        { label: "Reload from disk", run: () => load(path) },
        { label: "Keep editing", run: () => {} },
      ],
    });
  }, [load, path]);

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
        id: "document.new",
        section: "Document",
        title: "New document…",
        hint: "⌘N",
        run: () => requestNew(),
      },
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
        id: "document.notion",
        section: "Document",
        title: "Copy document for Notion",
        run: () => copyForNotion(null),
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

    if (path) {
      const current = path;
      list.splice(
        3,
        0,
        {
          id: "document.rename",
          section: "Document",
          title: "Rename document…",
          run: () => setField({ mode: "rename", from: current }),
        },
        {
          id: "document.trash",
          section: "Document",
          title: "Move document to Trash",
          run: () => trash(current),
        },
      );
    }

    for (const mode of VIEWS) {
      list.push({
        id: `view.${mode.id}`,
        section: "View",
        title: `${mode.label} view`,
        hint: mode.chord ?? `⌘${mode.key}`,
        run: () => setView(mode.id),
      });
    }

    list.push({
      id: "view.sidebar",
      section: "View",
      title: sidebarCollapsed ? "Show sidebar" : "Hide sidebar",
      hint: "⌘B",
      run: toggleSidebar,
    });

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
  }, [autoScroll, config?.settings, copyForNotion, path, reload, requestNew, save, sidebarCollapsed, toggleSidebar, trash, updateSettings]);

  // --- Shortcuts -----------------------------------------------------------

  // VS Code's keys, so the hands that already know them do not have to learn a
  // second set: ⌘P finds a file, ⌘B toggles the sidebar, ⇧⌘V toggles the
  // preview, and ⌘K is a chord prefix (⌘K V opens the preview to the side).
  const chord = useRef(false);
  const chordTimer = useRef<number | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const lastSourceView = useRef<View>("split");

  useEffect(() => {
    const flash = (message: string) => {
      setStatus(message);
      if (chordTimer.current !== null) window.clearTimeout(chordTimer.current);
      chordTimer.current = window.setTimeout(() => {
        setStatus((current) => (current === message ? null : current));
      }, 2500);
    };

    const onKey = (event: KeyboardEvent) => {
      // The second key of a ⌘K chord comes without ⌘, so it is handled before
      // the modifier check below — and swallowed, or ⌘K V would type a "v".
      if (chord.current) {
        if (["Meta", "Control", "Shift", "Alt"].includes(event.key)) return;
        chord.current = false;
        event.preventDefault();
        // Cancelling keydown is meant to stop the character, but not every
        // input path honours it — the text arrives as its own beforeinput. The
        // one keystroke that finishes a chord types nothing, whatever delivers it.
        const swallow = (input: Event) => input.preventDefault();
        document.addEventListener("beforeinput", swallow, { capture: true, once: true });
        document.addEventListener("keypress", swallow, { capture: true, once: true });
        window.setTimeout(() => {
          document.removeEventListener("beforeinput", swallow, { capture: true });
          document.removeEventListener("keypress", swallow, { capture: true });
        }, 0);
        setStatus(null);

        if (event.key.toLowerCase() === "v") {
          // A real command, just not one that applies with the search up or
          // the window too narrow to split — so no "not a command" for it.
          if (!searching && canSplit) setView("split");
        } else {
          flash(`The key combination (⌘K, ${event.key.toUpperCase()}) is not a command.`);
        }
        return;
      }

      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;

      const key = event.key.toLowerCase();

      if (key === "k" && !event.shiftKey) {
        event.preventDefault();
        chord.current = true;
        setStatus("(⌘K) was pressed. Waiting for second key of chord…");
      } else if (key === "p" && !event.shiftKey) {
        event.preventDefault();
        setPalette("all");
      } else if (key === "v" && event.shiftKey) {
        // Toggles between the preview and whichever source view was showing,
        // the way VS Code's Markdown: Toggle Preview does.
        event.preventDefault();
        if (searching) return;
        if (viewRef.current === "preview") {
          setView(lastSourceView.current);
        } else {
          lastSourceView.current = viewRef.current;
          setView("preview");
        }
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
      } else if (key === "n" && !event.shiftKey) {
        event.preventDefault();
        requestNew();
      } else if (key === "b" && !event.shiftKey) {
        event.preventDefault();
        toggleSidebar();
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
  }, [canSplit, requestNew, save, searching, toggleSidebar]);

  return (
    <div className="app">
      {/* The desktop shell hides the native title bar, so this header is one:
          a mousedown on the bar itself (not on a control) drags the window. */}
      <header className="app__header" data-tauri-drag-region>
        {/* First in the bar, beside the traffic lights: where macOS puts it. */}
        <button
          type="button"
          className="sidebar-toggle"
          aria-controls="sidebar"
          aria-expanded={compact ? railOpen : !sidebarCollapsed}
          aria-label={(compact ? !railOpen : sidebarCollapsed) ? "Show sidebar" : "Hide sidebar"}
          title={`${(compact ? !railOpen : sidebarCollapsed) ? "Show" : "Hide"} sidebar (⌘B)`}
          onClick={compact ? () => setRailOpen((open) => !open) : toggleSidebar}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect className="sidebar-toggle__pane" x="2" y="3" width="4" height="10" />
            <rect className="sidebar-toggle__frame" x="1.5" y="2.5" width="13" height="11" rx="1.5" />
            <path className="sidebar-toggle__frame" d="M6 2.5v11" />
          </svg>
        </button>

        <Wordmark />

        {phoneTitle ? (
          <h1 className="app__title">{phoneTitle}</h1>
        ) : (
        /* The document as a sign: its line, then its station. */
        <div className="app__doc" data-tauri-drag-region>
          <span className="app__line" data-ink={ink}>
            {lineName(path)}
          </span>
          <span className="app__path" title={path ?? "untitled"}>
            {path ? stationName(path) : "untitled"}
          </span>
          <span
            className={`app__state${saved ? "" : " is-dirty"}`}
            title={saved ? "Saved" : "Unsaved changes"}
          >
            {saved ? "saved" : "edited"}
          </span>
        </div>
        )}

        {phone && phoneTitle === "Documents" ? (
          <>
            <button
              type="button"
              className="app__icon"
              aria-label="New document"
              onClick={() => requestNew()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              className="app__icon"
              aria-label="Settings"
              onClick={() => setShowSettings(true)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  strokeLinejoin="round"
                  d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
                />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </>
        ) : phone && phoneTitle ? null : phone ? (
          <button
            type="button"
            className="button button--quiet"
            aria-pressed={view === "editor"}
            onClick={() => {
              setPhoneTab("read");
              setSearching(false);
              setView(view === "editor" ? "preview" : "editor");
            }}
          >
            {view === "editor" ? "Done" : "Edit"}
          </button>
        ) : (
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
        )}

        <button
          type="button"
          className="button button--quiet app__settings"
          onClick={() => setShowSettings(true)}
          title="Settings (⌘,)"
          aria-label="Settings"
        >
          Settings
        </button>

        {/* On iPhone, Save appears when there is something to save, and only
            beside the document; a control that can never be pressed is noise. */}
        {(!phone || (!saved && !phoneTitle)) && (
          <button
            type="button"
            className="button"
            onClick={save}
            disabled={saved}
            title={path ? undefined : "Save as a new document"}
          >
            Save
            <kbd className="button__key">⌘S</kbd>
          </button>
        )}
      </header>

      {decision ? (
        <DecisionBar decision={decision} onDone={() => setDecision(null)} />
      ) : status && (
        <div className="banner" role="status">
          <span className="banner__dot" />
          {status}
          <button type="button" className="banner__dismiss" onClick={() => setStatus(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="app__body">
        {/* Entries open their own menu and stop the event; a right-click that
            reaches the sidebar itself landed on empty space. */}
        <aside
          id="sidebar"
          className="sidebar"
          hidden={phone ? phoneTab !== "documents" : compact ? !railOpen : sidebarCollapsed}
          onContextMenu={(event) => {
            if (wantsNativeMenu(event.target)) return;
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY, entry: null });
          }}
        >
          {/* The open document's own line first: where the reader is in it is
              the thing looked for most, the network of documents second. */}
          {!phone && (
            <section className="sidebar__now" aria-label={`Outline of ${stationName(path)}`}>
              <h2 className="sidebar__heading">
                <span className="app__line" data-ink={ink}>
                  {lineName(path)}
                </span>
                <span className="sidebar__heading-name">{stationName(path)}</span>
              </h2>
              <DocumentLine
                title={stationName(path)}
                headings={headings}
                ink={ink}
                current={currentStation}
                alerts={alerts}
                onJump={jumpTo}
              />
            </section>
          )}

          {/* One row: the palette as a field (a button dressed as one, since the
              palette is the search surface), search across documents, and New.
              On iPhone the Search tab and the bar's + stand in for them. */}
          {!phone && (
            <div className="sidebar__controls">
              <button type="button" className="sidebar__search" onClick={() => setPalette("all")}>
                <span>Find a document…</span>
                <kbd>⌘P</kbd>
              </button>
              <button
                type="button"
                className={`sidebar__icon${searching ? " is-active" : ""}`}
                aria-label="Search in documents"
                title="Search in documents (⌘⇧F)"
                onClick={() => setSearching(true)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="6" />
                  <path d="m15.5 15.5 4.5 4.5" />
                </svg>
              </button>
              <button
                type="button"
                className="sidebar__icon"
                aria-label="New document"
                title="New document (⌘N)"
                onClick={() => requestNew()}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          )}

          {field?.mode === "create" ? (
            <PathField
              key={`create:${field.initial}`}
              verb="create"
              label="New document path"
              initial={field.initial}
              onSubmit={create}
              onCancel={() => setField(null)}
            />
          ) : field?.mode === "rename" ? (
            <PathField
              key={`rename:${field.from}`}
              verb="rename"
              label={`Rename ${field.from}`}
              initial={field.from}
              selectName
              onSubmit={rename}
              onCancel={() => setField(null)}
            />
          ) : null}

          <p className="sidebar__root" title={root ?? ""}>
            {rootLabel}
          </p>

          <FileTree
            key={treeGeneration}
            path="."
            selected={path}
            onSelect={open}
            revision={treeRevision}
            onEntryMenu={(entry, x, y) => setMenu({ x, y, entry })}
            onEntryCommand={runEntryCommand}
          />
        </aside>

        {compact && railOpen && (
          <button
            type="button"
            className="rail-scrim"
            aria-label="Close sidebar"
            onClick={() => setRailOpen(false)}
          />
        )}

        {phone && phoneTab === "outline" && !searching && (
          <section className="phone-panel" aria-label="Outline">
            <h2 className="phone-panel__title">
              <span className="app__line" data-ink={ink}>
                {lineName(path)}
              </span>
              {stationName(path)}
            </h2>
            <DocumentLine
              title={stationName(path)}
              headings={headings}
              ink={ink}
              current={currentStation}
              alerts={alerts}
              onJump={jumpTo}
            />
          </section>
        )}

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

        <main
          className={`panes panes--${view}`}
          data-ink={ink}
          hidden={searching || (phone && phoneTab !== "read")}
        >
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
              content={previewContent}
              renderCost={previewCost}
              documentPath={path}
              scrollerRef={previewRef}
              onScroll={linked.onPreviewScroll}
              activeLine={view === "split" ? linked.activeLine : null}
            />
          )}
        </main>
      </div>

      {phone && <TabBar active={searching ? "search" : phoneTab} onChange={onTab} />}

      <AutoScrollHud autoScroll={autoScroll} />

      {palette && (
        <CommandPalette
          commands={commands}
          commandsOnly={palette === "commands"}
          onOpenFile={open}
          onClose={() => setPalette(null)}
        />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={menu.entry ? menu.entry.path : "Documents"}
          items={menuItems}
          onClose={closeMenu}
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
