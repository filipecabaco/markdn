import { useCallback, useEffect, useState } from "react";
import { listDocuments, type Entry } from "../api";

/**
 * Lazily expanding document tree.
 *
 * Directories are listed one level at a time. Walking the whole root up front
 * would mean stat-ing an entire home directory before the first paint.
 */

interface Props {
  path: string;
  selected: string | null;
  onSelect: (path: string) => void;
  depth?: number;
}

export function FileTree({ path, selected, onSelect, depth = 0 }: Props) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listDocuments(path)
      .then((result) => {
        if (!cancelled) setEntries(result.entries);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  const toggle = useCallback((entryPath: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(entryPath)) next.delete(entryPath);
      else next.add(entryPath);
      return next;
    });
  }, []);

  if (error) return <div className="tree__error">{error}</div>;
  if (!entries) return <div className="tree__loading">Loading…</div>;
  if (entries.length === 0 && depth === 0) {
    return <div className="tree__empty">No markdown documents here.</div>;
  }

  return (
    <ul className="tree" style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      {entries.map((entry) => (
        <li key={entry.path}>
          {entry.type === "directory" ? (
            <>
              <button
                type="button"
                className="tree__dir"
                onClick={() => toggle(entry.path)}
                aria-expanded={expanded.has(entry.path)}
              >
                <span className="tree__chevron" aria-hidden="true" />
                {entry.name}
              </button>
              {expanded.has(entry.path) && (
                <FileTree
                  path={entry.path}
                  selected={selected}
                  onSelect={onSelect}
                  depth={depth + 1}
                />
              )}
            </>
          ) : (
            <button
              type="button"
              className={`tree__file${selected === entry.path ? " is-selected" : ""}`}
              onClick={() => onSelect(entry.path)}
            >
              {entry.name}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
