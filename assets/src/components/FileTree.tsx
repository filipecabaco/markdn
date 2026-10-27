import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { listDocuments, type Entry } from "../api";
import { lineFor } from "../lines";

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
  tail = true,
  listRef,
  onKeyDown,
}: Props & {
  /** Whether this level ends its line: true unless a sibling follows its folder. */
  tail?: boolean;
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

  if (error) return <div className="tree__error">{error}</div>;
  if (!entries) return <div className="tree__loading">Loading…</div>;
  if (entries.length === 0 && depth === 0) {
    return <div className="tree__empty">No markdown documents here.</div>;
  }

  return (
    <ul
      ref={listRef}
      className="tree"
      role={depth === 0 ? "tree" : "group"}
      aria-label={depth === 0 ? "Documents" : undefined}
      style={{ paddingLeft: depth === 0 ? 0 : 12 }}
      onKeyDown={onKeyDown}
    >
      {entries.map((entry, index) => {
        const directory = entry.type === "directory";
        const open = directory && expanded.has(entry.path);
        // The first row of the tree holds the Tab stop until something is focused.
        const tabbable = active ? active === entry.path : depth === 0 && index === 0;
        // Documents at the root ride the main line, which gets a name board of
        // its own like every folder's, so they never read as a folder's stations.
        const mainLineStart =
          depth === 0 && !directory && entries.findIndex((e) => e.type !== "directory") === index;
        // A folder's line ends at its last station however deep that sits, so
        // only the last row of the last nested level stops the track.
        const last = index === entries.length - 1;
        const terminus = depth > 0 && tail && last && !open;

        return (
          <Fragment key={entry.path}>
          {mainLineStart && (
            <li className="tree__board" data-ink="scarlet" aria-hidden="true">
              <div className="tree__row tree__dir">Main line</div>
            </li>
          )}
          <li
            role="treeitem"
            className="tree__item"
            aria-level={depth + 1}
            aria-expanded={directory ? open : undefined}
            aria-selected={directory ? undefined : selected === entry.path}
            tabIndex={tabbable ? 0 : -1}
            data-path={entry.path}
            data-name={entry.name}
            data-type={entry.type}
            data-terminus={terminus || undefined}
            // Each top-level folder is a line; everything inside it rides that
            // line's ink, which nested levels inherit through the CSS variable.
            data-ink={depth === 0 ? lineFor(directory ? `${entry.path}/` : entry.path) : undefined}
            onFocus={(event) => {
              if (event.target === event.currentTarget) setActive(entry.path);
            }}
          >
            <div
              className={`tree__row ${directory ? "tree__dir" : "tree__file"}${
                !directory && selected === entry.path ? " is-selected" : ""
              }`}
              onClick={() => (directory ? toggle(entry.path) : onSelect(entry.path))}
              onContextMenu={menuFor(entry)}
            >
              {directory && <span className="tree__chevron" aria-hidden="true" />}
              {entry.name}
            </div>
            {open && (
              <Level
                path={entry.path}
                selected={selected}
                onSelect={onSelect}
                revision={revision}
                onEntryMenu={onEntryMenu}
                depth={depth + 1}
                tail={depth === 0 || (tail && last)}
              />
            )}
          </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
