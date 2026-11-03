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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

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
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Search across documents">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <Input
          className="w-56 flex-1 md:max-w-72"
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

        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn("font-mono text-xs", caseSensitive && "bg-accent text-accent-foreground")}
          aria-pressed={caseSensitive}
          title="Match case"
          onClick={() => setCaseSensitive((current) => !current)}
        >
          Aa
        </Button>

        <Button
          type="button"
          onClick={search}
          disabled={query.trim() === "" || dirty.length > 0}
          title={dirty.length > 0 ? "Save or discard the current edits first" : undefined}
        >
          Search
        </Button>

        <Input
          className="w-56 flex-1 md:max-w-72"
          value={replacement}
          spellCheck={false}
          placeholder="Replace with…"
          aria-label="Replacement text"
          onChange={(event) => setReplacement(event.target.value)}
        />

        <Button
          type="button"
          variant="outline"
          onClick={replace}
          disabled={!applied || matchCount === 0}
        >
          Replace all
        </Button>

        <span className="ml-auto text-xs text-muted-foreground">
          {applied === null
            ? "no search yet"
            : `${matchCount} ${matchCount === 1 ? "match" : "matches"} in ${files.length} ${
                files.length === 1 ? "file" : "files"
              }${truncated ? " (truncated)" : ""}`}
        </span>

        <Button type="button" variant="ghost" onClick={close}>
          Close
          <Kbd>esc</Kbd>
        </Button>
      </div>

      {(dirty.length > 0 || error) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/60 px-3 py-2 text-sm" role="status">
          <span className={cn("mr-auto", error && "text-destructive")}>
            {error ??
              (leaving
                ? `Close and lose edits to ${dirty.length} ${
                    dirty.length === 1 ? "file" : "files"
                  }?`
                : `${dirty.length} ${dirty.length === 1 ? "file" : "files"} edited, not saved.`)}
          </span>

          <Button type="button" size="sm" onClick={saveAll} disabled={busy}>
            Save all
            <Kbd className="bg-primary-foreground/15 text-primary-foreground">⌘S</Kbd>
          </Button>

          <Button type="button" size="sm" variant="outline" onClick={leaving ? onClose : discard}>
            Discard
          </Button>

          {leaving && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setLeaving(false)}>
              Keep editing
            </Button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {busy && files.length === 0 && <p className="mx-auto max-w-md py-10 text-center text-sm text-muted-foreground">Searching…</p>}

        {!busy && applied !== null && files.length === 0 && (
          <p className="mx-auto max-w-md py-10 text-center text-sm text-muted-foreground">
            No document contains <strong>{applied.query}</strong>.
          </p>
        )}

        {applied === null && !busy && (
          <p className="mx-auto max-w-md py-10 text-center text-sm text-muted-foreground">
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
    <article className="mb-3 overflow-hidden rounded-lg border">
      <header className="flex items-center gap-2 border-b bg-muted/50 px-3 py-1.5">
        <button
          type="button"
          className="min-w-0 truncate text-left font-mono text-xs font-medium hover:underline"
          onClick={() => onOpen(file.path)}
        >
          {file.path}
        </button>
        {file.dirty && <span className="text-xs text-muted-foreground">edited</span>}
      </header>

      {file.segments.map((segment, index) => {
        const start = line;
        line += lineCount(segment.text);

        if (segment.kind === "gap") {
          return index === 0 || index === file.segments.length - 1 ? null : (
            <div key={index} className="h-px border-t border-dashed" aria-hidden="true" />
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
    <div className="flex">
      <div
        className="flex shrink-0 flex-col py-1.5 pr-2 pl-3 text-right font-mono text-[0.8125rem] leading-[1.7] text-muted-foreground/70 tabular-nums select-none"
        aria-hidden="true"
      >
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
