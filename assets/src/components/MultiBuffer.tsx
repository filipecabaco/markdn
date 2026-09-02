import { useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { searchContents } from "../api";
import {
  excerpts,
  findMatches,
  join,
  lineCount,
  replaceAll,
  type Segment,
} from "../multibuffer";
import { SourceArea } from "./SourceArea";

/**
 * Project-wide search whose results are editable in place.
 *
 * One surface for finding and for fixing: the excerpts around every match are
 * real editable source, not a preview of it, and a single save writes every file
 * that was touched. That is the whole point — the alternative is opening each
 * result, finding the line again, and editing it there.
 *
 * Only the excerpts are editable. The lines between them are held, unshown and
 * unchanged, so what is written back is the document rather than the part of it
 * that was on screen. `../multibuffer` holds that model.
 *
 * A search that would throw away unsaved edits is refused rather than confirmed
 * away: the results are a working copy, and losing one silently is the failure
 * this feature cannot have.
 */

export interface MultiBufferHandle {
  saveAll: () => void;
}

interface FileEdit {
  path: string;
  name: string;
  segments: Segment[];
  dirty: boolean;
}

/** The query the results on screen belong to, which is not what is in the field. */
interface Applied {
  query: string;
  caseSensitive: boolean;
}

interface Props {
  ref?: Ref<MultiBufferHandle>;
  /** Saves one document. Rejects with a message the user should see. */
  onSave: (path: string, contents: string) => Promise<void>;
  onOpen: (path: string) => void;
  onClose: () => void;
}

export function MultiBuffer({ ref, onSave, onOpen, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [applied, setApplied] = useState<Applied | null>(null);
  const [files, setFiles] = useState<FileEdit[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const request = useRef(0);

  const dirty = files.filter((file) => file.dirty);

  const matchCount = useMemo(() => {
    if (!applied) return 0;

    return files.reduce(
      (total, file) =>
        total +
        file.segments.reduce(
          (count, segment) =>
            segment.kind === "excerpt"
              ? count + findMatches(segment.text, applied.query, applied.caseSensitive).length
              : count,
          0,
        ),
      0,
    );
  }, [applied, files]);

  const search = () => {
    const term = query.trim();
    if (term === "" || dirty.length > 0) return;

    // A slower search that resolves after a newer one must not overwrite it.
    const id = request.current + 1;
    request.current = id;

    setBusy(true);
    setError(null);

    searchContents(term, { caseSensitive })
      .then((result) => {
        if (request.current !== id) return;

        setFiles(
          result.files.map((file) => ({
            path: file.path,
            name: file.name,
            segments: excerpts(file.contents, term, caseSensitive),
            dirty: false,
          })),
        );
        setApplied({ query: term, caseSensitive });
        setTruncated(result.truncated);
        setBusy(false);
      })
      .catch((failure: Error) => {
        if (request.current !== id) return;
        setError(failure.message);
        setBusy(false);
      });
  };

  const edit = (path: string, index: number, text: string) => {
    setFiles((current) =>
      current.map((file) =>
        file.path === path
          ? {
              ...file,
              dirty: true,
              segments: file.segments.map((segment, at) =>
                at === index ? { ...segment, text } : segment,
              ),
            }
          : file,
      ),
    );
  };

  const replace = () => {
    if (!applied) return;

    setFiles((current) =>
      current.map((file) => {
        const segments = file.segments.map((segment) =>
          segment.kind === "excerpt"
            ? {
                ...segment,
                text: replaceAll(segment.text, applied.query, replacement, applied.caseSensitive),
              }
            : segment,
        );

        const changed = segments.some((segment, at) => segment.text !== file.segments[at].text);
        return changed ? { ...file, segments, dirty: true } : file;
      }),
    );
  };

  const saveAll = () => {
    if (dirty.length === 0 || busy) return;

    setBusy(true);
    setError(null);

    // Sequential: a save that fails must not leave the ones after it in doubt,
    // and there are never more than a screenful of files here.
    dirty
      .reduce(
        (chain, file) =>
          chain.then(() =>
            onSave(file.path, join(file.segments)).then(() => {
              setFiles((current) =>
                current.map((entry) =>
                  entry.path === file.path ? { ...entry, dirty: false } : entry,
                ),
              );
            }),
          ),
        Promise.resolve(),
      )
      .catch((failure: Error) => setError(failure.message))
      .finally(() => setBusy(false));
  };

  useImperativeHandle(ref, () => ({ saveAll }));

  const discard = () => {
    setFiles([]);
    setApplied(null);
    setError(null);
    setLeaving(false);
  };

  // Closing with edits in flight would drop them with nothing said, so the close
  // asks once. Everything else about this feature is undoable; this is not.
  const close = () => {
    if (dirty.length === 0) onClose();
    else setLeaving(true);
  };

  // Following a result out of the multibuffer is a close, and carries the same
  // question with it.
  const openFile = (target: string) => {
    if (dirty.length === 0) onOpen(target);
    else setLeaving(true);
  };

  return (
    <section className="multibuffer" aria-label="Search across documents">
      <div className="mb__bar">
        <input
          className="mb__field"
          value={query}
          autoFocus
          spellCheck={false}
          placeholder="Search all documents…"
          aria-label="Search all documents"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              search();
            } else if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
        />

        <button
          type="button"
          className={`mb__toggle${caseSensitive ? " is-active" : ""}`}
          aria-pressed={caseSensitive}
          title="Match case"
          onClick={() => setCaseSensitive((current) => !current)}
        >
          Aa
        </button>

        <button
          type="button"
          className="button"
          onClick={search}
          disabled={query.trim() === "" || dirty.length > 0}
          title={dirty.length > 0 ? "Save or discard the current edits first" : undefined}
        >
          Search
          <kbd className="button__key">↵</kbd>
        </button>

        <input
          className="mb__field mb__field--replace"
          value={replacement}
          spellCheck={false}
          placeholder="Replace with…"
          aria-label="Replacement text"
          onChange={(event) => setReplacement(event.target.value)}
        />

        <button
          type="button"
          className="button button--quiet"
          onClick={replace}
          disabled={!applied || matchCount === 0}
        >
          Replace all
        </button>

        <span className="mb__count">
          {applied === null
            ? "no search yet"
            : `${matchCount} ${matchCount === 1 ? "match" : "matches"} in ${files.length} ${
                files.length === 1 ? "file" : "files"
              }${truncated ? " (truncated)" : ""}`}
        </span>

        <button type="button" className="button button--quiet" onClick={close}>
          Close
          <kbd className="button__key">esc</kbd>
        </button>
      </div>

      {(dirty.length > 0 || error) && (
        <div className="mb__notice" role="status">
          <span>
            {error ??
              (leaving
                ? `Close and lose edits to ${dirty.length} ${
                    dirty.length === 1 ? "file" : "files"
                  }?`
                : `${dirty.length} ${dirty.length === 1 ? "file" : "files"} edited, not saved.`)}
          </span>

          <button type="button" className="button" onClick={saveAll} disabled={busy}>
            Save all
            <kbd className="button__key">⌘S</kbd>
          </button>

          <button
            type="button"
            className="button button--quiet"
            onClick={leaving ? onClose : discard}
          >
            Discard
          </button>

          {leaving && (
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setLeaving(false)}
            >
              Keep editing
            </button>
          )}
        </div>
      )}

      <div className="mb__results">
        {busy && files.length === 0 && <p className="mb__empty">Searching…</p>}

        {!busy && applied !== null && files.length === 0 && (
          <p className="mb__empty">
            No document contains <strong>{applied.query}</strong>.
          </p>
        )}

        {applied === null && !busy && (
          <p className="mb__empty">
            Search every markdown document under the root. Results are editable here; one save
            writes them all.
          </p>
        )}

        {applied !== null &&
          files.map((file) => (
            <FileGroup
              key={file.path}
              file={file}
              applied={applied}
              onOpen={openFile}
              onEdit={edit}
            />
          ))}
      </div>
    </section>
  );
}

interface FileGroupProps {
  file: FileEdit;
  applied: Applied;
  onOpen: (path: string) => void;
  onEdit: (path: string, index: number, text: string) => void;
}

function FileGroup({ file, applied, onOpen, onEdit }: FileGroupProps) {
  // Line numbers are counted from the segments themselves, so they stay true
  // after an edit adds or removes a line above.
  let line = 1;

  return (
    <article className="mb__file">
      <header className="mb__file-head">
        <button type="button" className="mb__path" onClick={() => onOpen(file.path)}>
          {file.path}
        </button>
        {file.dirty && <span className="mb__dirty">edited</span>}
      </header>

      {file.segments.map((segment, index) => {
        const start = line;
        line += lineCount(segment.text);

        if (segment.kind === "gap") {
          return index === 0 || index === file.segments.length - 1 ? null : (
            <div key={index} className="mb__gap" aria-hidden="true" />
          );
        }

        return (
          <Excerpt
            key={index}
            text={segment.text}
            firstLine={start}
            applied={applied}
            onChange={(text) => onEdit(file.path, index, text)}
          />
        );
      })}
    </article>
  );
}

interface ExcerptProps {
  text: string;
  firstLine: number;
  applied: Applied;
  onChange: (text: string) => void;
}

function Excerpt({ text, firstLine, applied, onChange }: ExcerptProps) {
  const hits = useMemo(
    () => findMatches(text, applied.query, applied.caseSensitive),
    [applied, text],
  );

  const lines = lineCount(text);

  return (
    <div className="mb__excerpt">
      <div className="mb__gutter" aria-hidden="true">
        {Array.from({ length: lines }, (_, offset) => (
          <span key={offset}>{firstLine + offset}</span>
        ))}
      </div>
      <SourceArea
        className="source--excerpt"
        value={text}
        hits={hits}
        autoGrow
        wrap="off"
        ariaLabel={`Excerpt at line ${firstLine}`}
        onChange={onChange}
      />
    </div>
  );
}
