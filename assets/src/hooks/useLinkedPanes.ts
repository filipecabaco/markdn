import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Couples the source pane and the rendered pane as two views of one document.
 *
 * The mapping is by block, not by scroll percentage. Percentage scrolling drifts
 * immediately because the two sides have unrelated heights: a three-line mermaid
 * fence renders as a 200px diagram, and a long table renders shorter than its
 * source. Every top-level block carries `data-line` (see `remarkSourcePositions`),
 * so a position in either pane resolves to a fractional source line, and that line
 * resolves back to a pixel offset on the other side by interpolating between the
 * two blocks bracketing it.
 *
 * Scroll handlers only read cached geometry — nothing is measured per frame.
 */

export interface Block {
  line: number;
  top: number;
  height: number;
  /** mdast node type, e.g. "paragraph" or "heading-2". Drives the rail's tick. */
  kind: string;
}

interface Options {
  editorRef: RefObject<HTMLTextAreaElement | null>;
  previewRef: RefObject<HTMLElement | null>;
  lineOffsets: number[];
  content: string;
  enabled: boolean;
}

/** Largest index whose value is <= target, or 0. */
function floorIndex(values: number[], target: number): number {
  let low = 0;
  let high = values.length - 1;
  let best = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (values[mid] <= target) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

/** Linear interpolation between two known (from -> to) pairs. */
function between(value: number, fromA: number, fromB: number, toA: number, toB: number) {
  if (fromB === fromA) return toA;
  const ratio = (value - fromA) / (fromB - fromA);
  return toA + (toB - toA) * ratio;
}

export function useLinkedPanes({
  editorRef,
  previewRef,
  lineOffsets,
  content,
  enabled,
}: Options) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [caretLine, setCaretLine] = useState(1);
  // Which pane is currently driving. Setting scrollTop fires a scroll event on
  // the other pane, which would drive back and fight the user's own scrolling.
  const driver = useRef<"editor" | "preview" | null>(null);
  const release = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const measureBlocks = useCallback(() => {
    const scroller = previewRef.current;
    if (!scroller) return;

    const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
    const found: Block[] = [];

    for (const el of scroller.querySelectorAll<HTMLElement>("[data-line]")) {
      const line = Number(el.dataset.line);
      if (!Number.isFinite(line)) continue;
      const rect = el.getBoundingClientRect();
      found.push({
        line,
        top: rect.top - base,
        height: rect.height,
        kind: el.dataset.block ?? "paragraph",
      });
    }

    found.sort((a, b) => a.line - b.line);
    setBlocks(found);
  }, [previewRef]);

  // Diagrams and highlighted code resolve asynchronously and change the height of
  // blocks after first paint, so a one-shot measure after render is not enough.
  useEffect(() => {
    const scroller = previewRef.current;
    if (!scroller) return;

    const frame = requestAnimationFrame(measureBlocks);
    if (typeof ResizeObserver === "undefined") return () => cancelAnimationFrame(frame);

    const observer = new ResizeObserver(() => measureBlocks());
    observer.observe(scroller);
    for (const el of scroller.querySelectorAll("[data-line]")) observer.observe(el);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [measureBlocks, content, previewRef]);

  const claim = useCallback((source: "editor" | "preview") => {
    if (driver.current && driver.current !== source) return false;
    driver.current = source;
    clearTimeout(release.current);
    release.current = setTimeout(() => {
      driver.current = null;
    }, 120);
    return true;
  }, []);

  /** Fractional source line currently at the top of the source pane. */
  const editorTopLine = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || lineOffsets.length === 0) return 1;

    const top = editor.scrollTop;
    const index = floorIndex(lineOffsets, top);
    const next = Math.min(index + 1, lineOffsets.length - 1);
    const fraction =
      next > index ? (top - lineOffsets[index]) / (lineOffsets[next] - lineOffsets[index]) : 0;

    return index + 1 + Math.max(0, Math.min(1, fraction));
  }, [editorRef, lineOffsets]);

  const previewYForLine = useCallback(
    (line: number) => {
      if (blocks.length === 0) return 0;
      const lines = blocks.map((b) => b.line);
      const index = floorIndex(lines, line);
      const block = blocks[index];
      const next = blocks[index + 1];

      if (!next) return block.top + (line > block.line ? block.height : 0);
      return between(line, block.line, next.line, block.top, next.top);
    },
    [blocks],
  );

  const lineForPreviewY = useCallback(
    (y: number) => {
      if (blocks.length === 0) return 1;
      const tops = blocks.map((b) => b.top);
      const index = floorIndex(tops, y);
      const block = blocks[index];
      const next = blocks[index + 1];

      if (!next) return block.line;
      return between(y, block.top, next.top, block.line, next.line);
    },
    [blocks],
  );

  const editorYForLine = useCallback(
    (line: number) => {
      if (lineOffsets.length === 0) return 0;
      const index = Math.max(0, Math.min(lineOffsets.length - 1, Math.floor(line) - 1));
      const next = Math.min(index + 1, lineOffsets.length - 1);
      const fraction = line - Math.floor(line);
      return between(fraction, 0, 1, lineOffsets[index], lineOffsets[next]);
    },
    [lineOffsets],
  );

  const onEditorScroll = useCallback(() => {
    if (!enabled || !claim("editor")) return;
    const preview = previewRef.current;
    if (!preview) return;
    preview.scrollTop = previewYForLine(editorTopLine());
  }, [claim, editorTopLine, enabled, previewRef, previewYForLine]);

  const onPreviewScroll = useCallback(() => {
    if (!enabled || !claim("preview")) return;
    const editor = editorRef.current;
    const preview = previewRef.current;
    if (!editor || !preview) return;
    editor.scrollTop = editorYForLine(lineForPreviewY(preview.scrollTop));
  }, [claim, editorRef, editorYForLine, enabled, lineForPreviewY, previewRef]);

  const onCaretChange = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    // Counting newlines before the caret is O(n) per keystroke but on a document
    // a person is editing that is microseconds, and it is always exact.
    const upto = editor.value.slice(0, editor.selectionStart);
    setCaretLine(upto.split("\n").length);
  }, [editorRef]);

  useEffect(() => {
    setCaretLine((current) => Math.min(current, content.split("\n").length));
  }, [content]);

  // The block the caret sits in: the last block starting at or before it.
  const activeLineValue =
    blocks.length === 0
      ? null
      : blocks[floorIndex(blocks.map((b) => b.line), caretLine)]?.line ?? null;

  // Marking the element directly rather than through a React key: the rendered
  // tree is produced by react-markdown from the document, so there is no
  // component boundary to hang a prop on. One class swap per caret move is
  // cheaper than re-rendering the document to move a highlight.
  useEffect(() => {
    const scroller = previewRef.current;
    if (!scroller) return;

    const previous = scroller.querySelectorAll(".is-active-block");
    for (const el of previous) el.classList.remove("is-active-block");

    if (activeLineValue == null || !enabled) return;
    scroller
      .querySelector(`[data-line="${activeLineValue}"]`)
      ?.classList.add("is-active-block");
  }, [activeLineValue, blocks, enabled, previewRef]);

  return {
    blocks,
    caretLine,
    activeLine: activeLineValue,
    onEditorScroll,
    onPreviewScroll,
    onCaretChange,
  };
}
