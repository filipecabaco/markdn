/** The document's own name, without its extension. */
export function displayName(path: string | null): string {
  if (!path) return "Untitled";
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.replace(/\.(md|mdx|markdown)$/i, "");
}

export interface Heading {
  line: number;
  depth: number;
  text: string;
}

/**
 * The document's outline: its headings, levels 1–3, in order. Read from the
 * source rather than the render so the outline exists in Source view too, and
 * a `#` inside a fenced block is code, not a heading.
 */
export function headingsOf(source: string): Heading[] {
  const headings: Heading[] = [];
  let fence: string | null = null;

  source.split("\n").forEach((raw, index) => {
    const fenceMatch = raw.match(/^\s{0,3}(```+|~~~+)/);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
      return;
    }
    if (fence !== null) return;

    const match = raw.match(/^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (match) {
      headings.push({
        line: index + 1,
        depth: match[1].length,
        text: match[2].replace(/[*_`]/g, ""),
      });
    }
  });

  return headings;
}

/**
 * Lines that differ between two versions of a document, as the 1-based range in
 * the new one. Used to mark the sections an agent's write
 * touched; the common prefix and suffix bound it, which is exact for one edit
 * and a covering range for several.
 */
export function changedRange(before: string, after: string): [number, number] | null {
  if (before === after) return null;
  const a = before.split("\n");
  const b = after.split("\n");

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  return [start + 1, Math.max(start + 1, endB + 1)];
}

/** The headings whose sections overlap a changed range. */
export function sectionsIn(headings: Heading[], range: [number, number]): Set<number> {
  const touched = new Set<number>();
  headings.forEach((heading, index) => {
    const sectionEnd = (headings[index + 1]?.line ?? Number.MAX_SAFE_INTEGER) - 1;
    if (heading.line <= range[1] && sectionEnd >= range[0]) touched.add(heading.line);
  });
  // A change above the first heading belongs to the first section.
  if (touched.size === 0 && headings.length > 0) touched.add(headings[0].line);
  return touched;
}
