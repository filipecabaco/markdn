import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { patchLines } from "../patchLines";

/**
 * Measures the pixel offset of every source line in a textarea.
 *
 * A textarea exposes no per-line geometry, and `line * lineHeight` is wrong the
 * moment a line wraps — which, in prose, is most of them. So the text is
 * re-rendered into a hidden mirror that copies the textarea's box and typography
 * exactly, one block element per line, and each element's offsetTop is read back.
 *
 * The mirror is measured on content and width changes only, never per frame:
 * scroll handlers read the cached array.
 */

// Every property that can change where a glyph lands. Missing one shows up as a
// slow drift down a long document.
const COPIED_STYLES = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "wordSpacing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "boxSizing",
  "tabSize",
] as const;

export function useLineOffsets(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  /** Only split view reads the offsets; elsewhere measuring is pure cost. */
  enabled = true,
): number[] {
  const mirror = useRef<HTMLDivElement | null>(null);
  // The text each mirror line holds, so a keystroke rewrites one line element
  // instead of rebuilding thousands and laying all of them out again.
  const mirrored = useRef<string[]>([]);
  const [offsets, setOffsets] = useState<number[]>([]);

  const measure = useCallback(() => {
    const textarea = ref.current;
    if (!textarea || !enabled) return;

    if (!mirror.current) {
      const node = document.createElement("div");
      node.setAttribute("aria-hidden", "true");
      node.style.position = "absolute";
      node.style.visibility = "hidden";
      node.style.pointerEvents = "none";
      node.style.top = "0";
      node.style.left = "-9999px";
      document.body.appendChild(node);
      mirror.current = node;
    }

    const node = mirror.current;
    const style = getComputedStyle(textarea);

    for (const prop of COPIED_STYLES) {
      node.style[prop] = style[prop];
    }
    node.style.width = `${textarea.clientWidth}px`;
    node.style.whiteSpace = "pre-wrap";
    node.style.overflowWrap = "break-word";
    node.style.wordBreak = style.wordBreak;

    const lines = value.split("\n");
    patchLines(node, mirrored.current, lines, (element, line) => {
      // A zero-width space keeps an empty line from collapsing to zero height.
      element.textContent = line.length === 0 ? "​" : line;
    });
    mirrored.current = lines;

    const paddingTop = parseFloat(style.paddingTop) || 0;
    const elements = node.children;
    const next = new Array<number>(elements.length);
    for (let index = 0; index < elements.length; index += 1) {
      next[index] = (elements[index] as HTMLElement).offsetTop - paddingTop;
    }
    setOffsets(next);
  }, [enabled, ref, value]);

  useEffect(() => {
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [measure]);

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => measure());
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [measure, ref]);

  useEffect(() => {
    return () => {
      mirror.current?.remove();
      mirror.current = null;
      mirrored.current = [];
    };
  }, []);

  return offsets;
}
