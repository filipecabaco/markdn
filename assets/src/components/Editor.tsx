import { useCallback, useEffect, type RefObject } from "react";
import { ComponentPicker } from "./ComponentPicker";

/**
 * Markdown source editor.
 *
 * A plain textarea rather than a rich-text surface: this is the pane the preview
 * mirrors, and keeping the source authoritative means what the user types is
 * exactly what lands on disk. Tab inserts two spaces instead of moving focus.
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

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;

    event.preventDefault();
    const element = event.currentTarget;
    const { selectionStart, selectionEnd } = element;
    onChange(`${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`);

    requestAnimationFrame(() => {
      element.setSelectionRange(selectionStart + 2, selectionStart + 2);
    });
  };

  return (
    <div className="editor">
      <textarea
        ref={textarea}
        className="editor__textarea"
        value={value}
        spellCheck={false}
        onChange={(event) => {
          onChange(event.target.value);
          onCaretChange?.();
        }}
        onKeyDown={onKeyDown}
        onScroll={onScroll}
        onSelect={onCaretChange}
        onClick={onCaretChange}
        placeholder="# Start writing…"
        aria-label="Markdown source"
      />
      <div className="editor__meter" aria-hidden="true">
        <span>{caretLine ?? 1}</span>
        <span className="editor__meter-sep">/</span>
        <span>{lineCount ?? 1}</span>
      </div>
      {picking && <ComponentPicker onInsert={insert} onClose={() => onPickingChange(false)} />}
    </div>
  );
}
