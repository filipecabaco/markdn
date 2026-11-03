import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { listDocuments, type Entry } from "../api";
import { ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lazily expanding document tree.
 *
 * Directories are listed one level at a time. Walking the whole root up front
 * would mean stat-ing an entire home directory before the first paint.
 *
 * Bumping `revision` re-lists every directory that is showing, in place, so a
 * file created here or by another writer appears without the tree collapsing.
 *
 * Keyboard behaviour is the WAI-ARIA tree pattern, the one Finder and every
 * editor sidebar follow: the tree is a single Tab stop, Up and Down walk the
 * visible rows, Right opens a folder or steps into it, Left closes it or steps
 * out to its parent, Enter opens. Shift+F10 or the menu key opens the row's
 * context menu, so nothing is reachable only by right-click.
 */

interface Props {
  path: string;
  selected: string | null;
  onSelect: (path: string) => void;
  revision?: number;
  /** Right-click on an entry, at the pointer. The menu itself is the app's. */
  onEntryMenu?: (entry: Entry, x: number, y: number) => void;
  /** A VS Code explorer key on the focused row; carried out by the app. */
  onEntryCommand?: (entry: Entry, command: EntryCommand) => void;
  depth?: number;
}

export type EntryCommand = "rename" | "trash" | "copyPath" | "copyRelativePath";

/**
 * VS Code's explorer keys on macOS: F2 renames, ⌘⌫ (or Delete, its key
 * elsewhere) moves to the Trash, ⌥⌘C and ⇧⌥⌘C copy the path. Matched on
 * `code` for the letter, because ⌥C types "ç" on a Mac and `key` says so.
 */
function explorerCommand(event: KeyboardEvent<HTMLElement>): EntryCommand | null {
  const meta = event.metaKey || event.ctrlKey;
  if (event.key === "F2") return "rename";
  if ((meta && event.key === "Backspace") || event.key === "Delete") return "trash";
  if (meta && event.altKey && event.code === "KeyC") {
    return event.shiftKey ? "copyRelativePath" : "copyPath";
  }
  return null;
}

/**
 * A folder that could not be listed, in words. macOS keeps some folders under
 * the home (Library/Accounts, Mail, Messages) from every app it has not been
 * given Full Disk Access, which is the usual case and not a fault.
 */
export function unreadable(message: string): string {
  return /permission denied|eperm|eacces/i.test(message)
    ? "markdn isn't allowed to read this folder."
    : `This folder couldn't be read: ${message}`;
}

/** Which row holds the tree's single Tab stop. Shared by every nested level. */
const Roving = createContext<{ active: string | null; setActive: (path: string) => void }>({
  active: null,
  setActive: () => {},
});

const ITEM = '[role="treeitem"]';

export function FileTree(props: Props) {
  const [active, setActive] = useState<string | null>(null);
  const root = useRef<HTMLUListElement>(null);

  // A row that went away (renamed, trashed, folded away by a click elsewhere)
  // would leave no Tab stop at all; fall back to the first row.
  useEffect(() => {
    if (!active || !root.current) return;
    const present = [...root.current.querySelectorAll<HTMLElement>(ITEM)].some(
      (item) => item.dataset.path === active,
    );
    if (!present) setActive(null);
  });

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const current = (event.target as HTMLElement).closest<HTMLElement>(ITEM);
    if (!current || !root.current) return;

    const items = [...root.current.querySelectorAll<HTMLElement>(ITEM)];
    const index = items.indexOf(current);
    const row = current.querySelector<HTMLElement>(":scope > .tree__row");
    const directory = current.dataset.type === "directory";
    const expanded = current.getAttribute("aria-expanded") === "true";

    const move = (target: Element | null | undefined) => {
      if (!target) return;
      event.preventDefault();
      (target as HTMLElement).focus();
    };

    const command = explorerCommand(event);
    if (command && props.onEntryCommand) {
      // Rename and Trash act on documents; folders only offer their paths.
      if (directory && (command === "rename" || command === "trash")) return;
      event.preventDefault();
      props.onEntryCommand(
        {
          name: current.dataset.name ?? "",
          path: current.dataset.path ?? "",
          type: directory ? "directory" : "file",
        },
        command,
      );
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        return move(items[index + 1]);
      case "ArrowUp":
        return move(items[index - 1]);
      case "Home":
        return move(items[0]);
      case "End":
        return move(items[items.length - 1]);
      case "ArrowRight":
        if (!directory) return;
        event.preventDefault();
        if (expanded) move(current.querySelector(`:scope > ul > ${ITEM}`));
        else row?.click();
        return;
      case "ArrowLeft":
        event.preventDefault();
        if (directory && expanded) row?.click();
        else move(current.parentElement?.closest(ITEM));
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        row?.click();
        return;
      case "ContextMenu":
      case "F10":
        if (event.key === "F10" && !event.shiftKey) return;
        if (!props.onEntryMenu || !row) return;
        event.preventDefault();
        {
          const box = row.getBoundingClientRect();
          props.onEntryMenu(
            {
              name: current.dataset.name ?? "",
              path: current.dataset.path ?? "",
              type: directory ? "directory" : "file",
            },
            box.left + 16,
            box.bottom,
          );
        }
        return;
      default:
    }
  };

  return (
    <Roving.Provider value={{ active, setActive }}>
      <Level {...props} listRef={root} onKeyDown={onKeyDown} />
    </Roving.Provider>
  );
}

function Level({
  path,
  selected,
  onSelect,
  revision = 0,
  onEntryMenu,
  depth = 0,
  listRef,
  onKeyDown,
}: Props & {
  listRef?: React.Ref<HTMLUListElement>;
  onKeyDown?: (event: KeyboardEvent<HTMLUListElement>) => void;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const { active, setActive } = useContext(Roving);

  useEffect(() => {
    let cancelled = false;

    listDocuments(path)
      .then((result) => {
        if (cancelled) return;
        setEntries(result.entries);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [path, revision]);

  const toggle = useCallback((entryPath: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(entryPath)) next.delete(entryPath);
      else next.add(entryPath);
      return next;
    });
  }, []);

  // Stops here so the sidebar's own menu (New document…) does not open as well.
  const menuFor = (entry: Entry) => (event: MouseEvent) => {
    if (!onEntryMenu) return;
    event.preventDefault();
    event.stopPropagation();
    onEntryMenu(entry, event.clientX, event.clientY);
  };

  const note = (kind: "error" | "loading" | "empty", text: string) => {
    const line = (
      <div
        className={cn(
          "py-1 pr-2 pl-[calc(var(--depth)*12px+30px)] text-xs text-muted-foreground",
          kind === "error" && "text-destructive",
        )}
      >
        {text}
      </div>
    );
    return depth === 0 ? (
      <div style={{ "--depth": -1 } as CSSProperties}>{line}</div>
    ) : (
      <ul role="group">
        <li style={{ "--depth": depth } as CSSProperties}>{line}</li>
      </ul>
    );
  };

  if (error) return note("error", unreadable(error));
  if (!entries) return note("loading", "Loading…");
  if (entries.length === 0) return note("empty", "No markdown documents here.");

  return (
    <ul
      ref={listRef}
      className="flex flex-col"
      role={depth === 0 ? "tree" : "group"}
      aria-label={depth === 0 ? "Documents" : undefined}
      onKeyDown={onKeyDown}
    >
      {entries.map((entry, index) => {
        const directory = entry.type === "directory";
        const open = directory && expanded.has(entry.path);
        const current = !directory && selected === entry.path;
        // The first row of the tree holds the Tab stop until something is focused.
        const tabbable = active ? active === entry.path : depth === 0 && index === 0;
        const Icon = directory ? (open ? FolderOpen : Folder) : FileText;

        return (
          <li
            key={entry.path}
            role="treeitem"
            className="outline-none [&:focus-visible>.tree__row]:ring-2 [&:focus-visible>.tree__row]:ring-sidebar-ring"
            aria-level={depth + 1}
            aria-expanded={directory ? open : undefined}
            aria-selected={directory ? undefined : current}
            tabIndex={tabbable ? 0 : -1}
            data-path={entry.path}
            data-name={entry.name}
            data-type={entry.type}
            style={{ "--depth": depth } as CSSProperties}
            onFocus={(event) => {
              if (event.target === event.currentTarget) setActive(entry.path);
            }}
          >
            <div
              className={cn(
                "tree__row flex h-7 cursor-default items-center gap-1.5 rounded-md pr-2 pl-[calc(var(--depth)*12px+8px)] text-[0.8125rem] text-sidebar-foreground/85 select-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                current && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
              )}
              onClick={() => (directory ? toggle(entry.path) : onSelect(entry.path))}
              onContextMenu={menuFor(entry)}
            >
              {directory ? (
                <ChevronRight
                  aria-hidden="true"
                  className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
                />
              ) : (
                <span className="w-3.5 shrink-0" aria-hidden="true" />
              )}
              <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            </div>
            {open && (
              <Level
                path={entry.path}
                selected={selected}
                onSelect={onSelect}
                revision={revision}
                onEntryMenu={onEntryMenu}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
