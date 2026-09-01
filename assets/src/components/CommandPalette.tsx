import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchDocuments, type SearchHit } from "../api";
import { fuzzyMatch } from "../fuzzy";

/**
 * One palette for both commands and documents.
 *
 * Two lists in one surface rather than two shortcuts to remember: typing filters
 * commands in the browser (there are a dozen, and they must respond on the
 * keystroke) and documents on the server (the tree can be a whole home
 * directory, so it is walked where it lives). A leading `>` narrows to commands
 * only, the convention every editor palette already uses.
 *
 * Opened empty it is a recent-documents list: the server answers a blank query
 * with the most recently modified files, which is the thing most likely to be
 * wanted before anything is typed.
 */

export interface Command {
  id: string;
  title: string;
  /** Grouping header, e.g. "View". Also matched against, so "view split" works. */
  section: string;
  /** Rendered as a key hint on the right, e.g. "⌘2". */
  hint?: string;
  run: () => void;
}

type Item =
  | { kind: "command"; key: string; command: Command; matches: number[] }
  | { kind: "file"; key: string; hit: SearchHit };

interface Props {
  commands: Command[];
  /** True to open in commands-only mode, as if the query already began with ">". */
  commandsOnly?: boolean;
  onOpenFile: (path: string) => void;
  onClose: () => void;
}

const FILE_LIMIT = 50;
const DEBOUNCE_MS = 110;

/** Splits `text` into matched and unmatched runs so hits can be marked. */
function highlight(text: string, matches: number[]) {
  if (matches.length === 0) return text;

  const hit = new Set(matches);
  const parts: { text: string; on: boolean }[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const on = hit.has(i);
    const last = parts[parts.length - 1];
    if (last && last.on === on) last.text += text[i];
    else parts.push({ text: text[i], on });
  }

  return parts.map((part, index) =>
    part.on ? (
      // eslint-disable-next-line react/no-array-index-key -- runs are positional
      <mark key={index} className="palette__hit">
        {part.text}
      </mark>
    ) : (
      <span key={index}>{part.text}</span>
    ),
  );
}

export function CommandPalette({ commands, commandsOnly = false, onOpenFile, onClose }: Props) {
  const [query, setQuery] = useState(commandsOnly ? ">" : "");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commandMode = query.startsWith(">");
  const term = commandMode ? query.slice(1).trim() : query.trim();

  const matchedCommands = useMemo(() => {
    return commands
      .map((command) => {
        // Matched against the title, but the section is searchable too, so
        // "view render" finds a command titled "Render" under "View".
        const onTitle = fuzzyMatch(command.title, term);
        const onSection = onTitle ? null : fuzzyMatch(`${command.section} ${command.title}`, term);
        if (!onTitle && !onSection) return null;
        return {
          command,
          score: onTitle ? onTitle.score : (onSection?.score ?? 0) - 5,
          matches: onTitle ? onTitle.matches : [],
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => b.score - a.score);
  }, [commands, term]);

  // Documents come from the server, debounced: every keystroke would otherwise
  // start a tree walk that the next keystroke immediately makes irrelevant.
  useEffect(() => {
    if (commandMode) {
      setHits([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchDocuments(term, FILE_LIMIT, controller.signal)
        .then((result) => {
          setHits(result.results);
          setError(null);
        })
        .catch((err: Error) => {
          if (err.name !== "AbortError") setError(err.message);
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [commandMode, term]);

  const items = useMemo<Item[]>(() => {
    const commandItems: Item[] = matchedCommands.map(({ command, matches }) => ({
      kind: "command",
      key: `command:${command.id}`,
      command,
      matches,
    }));

    const fileItems: Item[] = hits.map((hit) => ({
      kind: "file",
      key: `file:${hit.path}`,
      hit,
    }));

    return [...commandItems, ...fileItems];
  }, [hits, matchedCommands]);

  // Any change to the result set makes the old index meaningless; the first row
  // is always the best guess.
  useEffect(() => setActive(0), [items.length, query]);

  const run = useCallback(
    (item: Item) => {
      onClose();
      if (item.kind === "command") item.command.run();
      else onOpenFile(item.hit.path);
    },
    [onClose, onOpenFile],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      setActive((current) => (items.length === 0 ? 0 : (current + 1) % items.length));
    } else if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
      event.preventDefault();
      setActive((current) =>
        items.length === 0 ? 0 : (current - 1 + items.length) % items.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[active];
      if (item) run(item);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  // Keyboard navigation has to drag the viewport with it, or the selection walks
  // off the bottom of a 50-file list with nothing to show for it.
  useEffect(() => {
    listRef.current
      ?.querySelector("[data-active='true']")
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let lastSection: string | null = null;

  return (
    <div className="picker__backdrop" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          className="palette__input"
          value={query}
          autoFocus
          spellCheck={false}
          placeholder="Search documents, or type > for commands…"
          aria-label="Search documents or commands"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />

        <div className="palette__list" ref={listRef} role="listbox">
          {error && <div className="palette__empty">{error}</div>}
          {!error && items.length === 0 && (
            <div className="palette__empty">No documents or commands match.</div>
          )}

          {items.map((item, index) => {
            const section = item.kind === "command" ? item.command.section : "Documents";
            const header = section !== lastSection ? section : null;
            lastSection = section;

            return (
              <div key={item.key}>
                {header && <div className="palette__section">{header}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  data-active={index === active}
                  className={`palette__row${index === active ? " is-active" : ""}`}
                  onMouseMove={() => setActive(index)}
                  onClick={() => run(item)}
                >
                  {item.kind === "command" ? (
                    <>
                      <span className="palette__label">
                        {highlight(item.command.title, item.matches)}
                      </span>
                      {item.command.hint && (
                        <kbd className="palette__hint">{item.command.hint}</kbd>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="palette__label">{item.hit.name}</span>
                      <span className="palette__path">
                        {highlight(item.hit.path, item.hit.matches)}
                      </span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="palette__footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>&gt;</kbd> commands
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
