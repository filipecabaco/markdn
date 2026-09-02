import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { highlightMarkdown, type TextRange } from "../markdown-syntax";

/**
 * A textarea with markdown syntax highlighting behind it.
 *
 * The textarea stays a real textarea — caret, selection, undo stack, IME and
 * spellcheck are the browser's, not a reimplementation — and its own text is
 * painted transparent over a layer that holds the same characters, coloured.
 * That is why the two boxes must agree on every property that moves a glyph:
 * they share one CSS rule, `.source__input, .source__layer`, rather than two
 * that look alike.
 *
 * Used by the editor pane and by every excerpt in the multibuffer, which is also
 * where `hits` comes in: the search underlines its matches through the same
 * layer, so an excerpt is highlighted and editable at once.
 */

/**
 * Above this, the layer costs more per keystroke than it is worth and the
 * document falls back to plain text. Roughly a 3,000-line document — far past
 * anything this editor is for, and the point is that the fallback is quiet
 * rather than that the number is exact.
 */
const MAX_HIGHLIGHT_CHARS = 200_000;

interface Props {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  /** Ranges to mark, e.g. search hits. Must be sorted and non-overlapping. */
  hits?: readonly TextRange[];
  /** Extra class on the wrapper, for pane-specific typography and padding. */
  className?: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
  /** Size to the content instead of scrolling. For excerpts, which are short. */
  autoGrow?: boolean;
  /**
   * Soft-wrap long lines, as prose wants. Excerpts turn it off: their gutter
   * numbers one row per line, and a wrapped line makes that a lie.
   */
  wrap?: "soft" | "off";
  onScroll?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSelect?: () => void;
  onClick?: () => void;
}

export function SourceArea({
  value,
  onChange,
  ariaLabel,
  hits,
  className = "",
  textareaRef,
  placeholder,
  autoGrow = false,
  wrap = "soft",
  onScroll,
  onKeyDown,
  onSelect,
  onClick,
}: Props) {
  const fallback = useRef<HTMLTextAreaElement>(null);
  const textarea = textareaRef ?? fallback;
  const layer = useRef<HTMLDivElement>(null);

  const highlighted = value.length <= MAX_HIGHLIGHT_CHARS;

  const html = useMemo(
    () => (highlighted ? highlightMarkdown(value, hits) : ""),
    [highlighted, hits, value],
  );

  // Typing at the bottom of the pane scrolls the textarea without any scroll
  // event this component sees first, so the layer is re-aligned after every
  // render rather than only from the handler.
  useLayoutEffect(() => {
    const element = textarea.current;
    const behind = layer.current;
    if (!element || !behind) return;

    behind.scrollTop = element.scrollTop;
    behind.scrollLeft = element.scrollLeft;
  });

  useLayoutEffect(() => {
    const element = textarea.current;
    if (!autoGrow || !element) return;

    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [autoGrow, textarea, value]);

  const sync = () => {
    const element = textarea.current;
    const behind = layer.current;

    if (element && behind) {
      behind.scrollTop = element.scrollTop;
      behind.scrollLeft = element.scrollLeft;
    }

    onScroll?.();
  };

  return (
    <div
      className={`source${highlighted ? "" : " source--plain"}${
        wrap === "off" ? " source--nowrap" : ""
      } ${className}`.trim()}
    >
      {/* Escaped in `highlightMarkdown`; every class in it is a literal. */}
      <div
        className="source__layer"
        aria-hidden="true"
        ref={layer}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <textarea
        ref={textarea}
        className="source__input"
        value={value}
        spellCheck={false}
        wrap={wrap}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        onScroll={sync}
        onKeyDown={onKeyDown}
        onSelect={onSelect}
        onClick={onClick}
      />
    </div>
  );
}
