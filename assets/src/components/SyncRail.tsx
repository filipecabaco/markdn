import { useEffect, useRef } from "react";
import type { Block } from "../hooks/useLinkedPanes";

/**
 * The hairline column between the two panes, showing which source block is which
 * rendered block.
 *
 * Ticks are laid out once at document coordinates and the whole strip is
 * translated on scroll, so scrolling costs one transform rather than a React
 * render per frame.
 */

// Tick length by block kind. A heading reads as a longer rule than a paragraph,
// which makes the rail scannable as a shape rather than a row of identical marks.
const WIDTHS: Record<string, number> = {
  "heading-1": 13,
  "heading-2": 11,
  "heading-3": 9,
  "heading-4": 8,
  "heading-5": 8,
  "heading-6": 8,
  code: 10,
  table: 10,
  blockquote: 8,
  list: 7,
  mdxJsxFlowElement: 10,
  thematicBreak: 13,
  paragraph: 5,
};

interface Props {
  blocks: Block[];
  activeLine: number | null;
  scrollerRef: React.RefObject<HTMLElement | null>;
}

export function SyncRail({ blocks, activeLine, scrollerRef }: Props) {
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const node = strip.current;
    if (!scroller || !node) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      node.style.transform = `translate3d(0, ${-scroller.scrollTop}px, 0)`;
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollerRef, blocks]);

  return (
    <div className="rail" aria-hidden="true">
      <div className="rail__strip" ref={strip}>
        {blocks.map((block) => (
          <span
            key={block.line}
            className={`rail__tick${block.line === activeLine ? " is-active" : ""}`}
            style={{ top: `${block.top}px`, width: `${WIDTHS[block.kind] ?? 5}px` }}
          />
        ))}
      </div>
    </div>
  );
}
