import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { ComponentPicker } from "./ComponentPicker";
import { SourceArea } from "./SourceArea";

/**
 * Markdown source editor.
 *
 * A textarea rather than a rich-text surface: this is the pane the preview
 * mirrors, and keeping the source authoritative means what the user types is
 * exactly what lands on disk. `SourceArea` paints the syntax behind it without
 * taking that over. Tab inserts two spaces instead of moving focus — but never
 * traps it: Shift+Tab leaves backwards as usual, and Escape then Tab leaves
 * forwards, the convention code editors share for exactly this.
 *
 * The component picker is opened from outside (Cmd/Ctrl+Shift+C, or the command
 * palette) but inserts from in here, where the textarea and its caret are: the
 * shortcut has to work in render view, where this component is not mounted.
 */

interface Props {
  value: string;
  onChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Whether the component picker is open. Owned by the app, not by the editor. */
  picking: boolean;
  onPickingChange: (open: boolean) => void;
  onScroll?: () => void;
  onCaretChange?: () => void;
  caretLine?: number;
  lineCount?: number;
}

export function Editor({
  value,
  onChange,
  textareaRef,
  picking,
  onPickingChange,
  onScroll,
  onCaretChange,
  caretLine,
  lineCount,
}: Props) {
  const textarea = textareaRef;

  const insert = useCallback(
    (snippet: string) => {
      const element = textarea.current;
      onPickingChange(false);

      if (!element) {
        onChange(`${value}\n${snippet}\n`);
        return;
      }

      const { selectionStart, selectionEnd } = element;
      const next = value.slice(0, selectionStart) + snippet + value.slice(selectionEnd);
      onChange(next);

      // Restore the caret after React has written the new value back.
      requestAnimationFrame(() => {
        element.focus();
        const caret = selectionStart + snippet.length;
        element.setSelectionRange(caret, caret);
      });
    },
    [onChange, onPickingChange, textarea, value],
  );

  // React's onSelect misses programmatic selection and some keyboard movement.
  // document-level selectionchange is the one signal that always fires.
  useEffect(() => {
    if (!onCaretChange) return;

    const onSelectionChange = () => {
      if (document.activeElement === textarea.current) onCaretChange();
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [onCaretChange, textarea]);

  const hint = useId();
  // Set by Escape and spent by the very next key, so "Escape, Tab" leaves the
  // field while Escape followed by typing changes nothing.
  const escaped = useRef(false);
  // VS Code's "Toggle Tab Key Moves Focus" (⌃⇧M): while on, Tab is the
  // browser's again and indenting waits until it is switched back off.
  const [tabMovesFocus, setTabMovesFocus] = useState(false);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.ctrlKey && event.shiftKey && !event.metaKey && event.code === "KeyM") {
      event.preventDefault();
      setTabMovesFocus((on) => !on);
      return;
    }

    const leaving = escaped.current;
    escaped.current = event.key === "Escape";

    const modified = event.shiftKey || event.metaKey || event.ctrlKey || event.altKey;
    if (event.key !== "Tab" || modified || leaving || tabMovesFocus) return;

    event.preventDefault();

    // insertText goes through the browser's own editing, so ⌘Z undoes it like
    // any other keystroke; rewriting the value from state would wipe the undo
    // history. The fallback is for engines without it (jsdom).
    if (document.execCommand?.("insertText", false, "  ")) return;

    const element = event.currentTarget;
    const { selectionStart, selectionEnd } = element;
    onChange(`${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`);

    requestAnimationFrame(() => {
      element.setSelectionRange(selectionStart + 2, selectionStart + 2);
    });
  };

  return (
    <div className="editor">
      <SourceArea
        className="source--editor"
        textareaRef={textarea}
        value={value}
        ariaLabel="Markdown source"
        ariaDescribedBy={hint}
        placeholder="# Start writing…"
        onChange={(next) => {
          onChange(next);
          onCaretChange?.();
        }}
        onKeyDown={onKeyDown}
        onScroll={onScroll}
        onSelect={onCaretChange}
        onClick={onCaretChange}
      />
      <p id={hint} className="visually-hidden">
        {tabMovesFocus
          ? "Tab moves focus. Control+Shift+M makes it insert spaces again."
          : "Tab inserts two spaces. Shift+Tab moves focus back; Escape then Tab, or Control+Shift+M, moves it forward."}
      </p>
      {/* The same word VS Code puts in its status bar, so the mode is never a
          surprise the next time Tab does not indent. */}
      {tabMovesFocus && (
        <div className="editor__mode" role="status">
          Tab moves focus
        </div>
      )}
      <div className="editor__meter" aria-hidden="true">
        <span>{caretLine ?? 1}</span>
        <span className="editor__meter-sep">/</span>
        <span>{lineCount ?? 1}</span>
      </div>
      {picking && <ComponentPicker onInsert={insert} onClose={() => onPickingChange(false)} />}
    </div>
  );
}
