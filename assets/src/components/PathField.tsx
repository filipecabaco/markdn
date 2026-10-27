import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

/**
 * Inline field for naming a document: a new one, or a new name for one.
 *
 * An input in the sidebar rather than `window.prompt`: the desktop webview does
 * not reliably implement native dialogs, and a field next to the tree shows the
 * user where the file will land. The path is relative to the root and may name
 * directories that do not exist yet — the server creates them.
 */

const EXTENSIONS = [".md", ".markdown", ".mdx"];

/**
 * The path to use for what the user typed.
 *
 * A bare name gets `.md`: nobody should have to type an extension to get the
 * default, and the server would otherwise refuse the name as not markdown.
 * Returns null for a name that is blank or ends in a separator, which names a
 * directory, not a document.
 */
export function documentName(input: string): string | null {
  const name = input.trim();
  if (name === "" || name.endsWith("/")) return null;

  const lower = name.toLowerCase();
  return EXTENSIONS.some((extension) => lower.endsWith(extension)) ? name : `${name}.md`;
}

interface Props {
  /** Prefilled path: the target directory for New, the current path for Rename. */
  initial: string;
  /** What Enter does, shown in the hint, e.g. "create" or "rename". */
  verb: string;
  /** Accessible name of the input. */
  label: string;
  /**
   * Select the file name, extension excluded, instead of placing the caret at
   * the end — what renaming wants, the way Finder does it.
   */
  selectName?: boolean;
  /** Resolves once done; a rejection's message is shown under the field. */
  onSubmit: (path: string) => Promise<void>;
  onCancel: () => void;
}

export function PathField({
  initial,
  verb,
  label,
  selectName = false,
  onSubmit,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = input.current;
    if (!element) return;
    element.focus();

    const end = element.value.length;
    if (selectName) {
      const start = element.value.lastIndexOf("/") + 1;
      const dot = element.value.lastIndexOf(".");
      element.setSelectionRange(start, dot > start ? dot : end);
    } else {
      element.setSelectionRange(end, end);
    }
  }, [selectName]);

  // The field is disabled while the request is out, and a disabled input drops
  // focus; without this, Escape and typing go nowhere after a refused name.
  useEffect(() => {
    if (error && !busy) input.current?.focus();
  }, [error, busy]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const path = documentName(value);
    if (!path) {
      setError("Name the document, e.g. notes/ideas.md");
      return;
    }

    setBusy(true);
    setError(null);
    onSubmit(path).catch((err: Error) => {
      setError(err.message);
      setBusy(false);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <form className="newdoc" onSubmit={submit}>
      <input
        ref={input}
        className="newdoc__input"
        aria-label={label}
        placeholder="notes/untitled.md"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        value={value}
        disabled={busy}
        aria-invalid={error !== null}
        aria-describedby={error ? "newdoc-error" : undefined}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Leaving an untouched field is a cancel; leaving one with a typed name
          // or an error on it is not, or the name and the reason would be lost.
          if (!busy && !error && value === initial) onCancel();
        }}
      />
      <div className="newdoc__hint">
        {error ? (
          <span id="newdoc-error" className="newdoc__error" role="alert">
            {error}
          </span>
        ) : (
          <span>
            <kbd>↵</kbd> {verb} · <kbd>esc</kbd> cancel
          </span>
        )}
      </div>
    </form>
  );
}
