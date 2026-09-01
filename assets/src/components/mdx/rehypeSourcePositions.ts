import type { Plugin } from "unified";
import type { Node, Parent } from "unist";

/**
 * Stamps every top-level rendered block with the source line it came from.
 *
 * This runs on the **hast** tree, not on mdast, on purpose. mdast handlers place
 * `data.hProperties` inconsistently — a heading keeps them, a fenced code block
 * puts them somewhere the rendered `<pre>` never sees — so stamping before the
 * transform silently loses code blocks and diagrams, which are exactly the blocks
 * whose rendered height differs most from their source. Positions survive the
 * mdast → hast transform, so doing it here catches every block uniformly.
 *
 * Only depth-1 children are stamped. Finer granularity buys a more precise
 * mapping and a much noisier rail; block level is the resolution people navigate
 * at.
 */

interface Element extends Node {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
}

// The rail draws a different tick per kind, so the block's shape travels with its
// position. Derived from the rendered tag, which is what the reader actually sees.
function kindOf(tagName: string): string {
  if (/^h[1-6]$/.test(tagName)) return `heading-${tagName[1]}`;

  switch (tagName) {
    case "pre":
    case "div":
      return "code";
    case "table":
      return "table";
    case "blockquote":
      return "blockquote";
    case "ul":
    case "ol":
      return "list";
    case "hr":
      return "thematicBreak";
    case "mdx-node":
      return "mdxJsxFlowElement";
    default:
      return "paragraph";
  }
}

export const rehypeSourcePositions: Plugin = () => {
  return (tree: Node) => {
    const root = tree as Parent;

    for (const child of root.children ?? []) {
      if (child.type !== "element") continue;
      const element = child as Element;

      const line = element.position?.start?.line;
      if (!line) continue;

      element.properties = {
        ...(element.properties ?? {}),
        "data-line": String(line),
        "data-block": kindOf(element.tagName),
      };
    }
  };
};
