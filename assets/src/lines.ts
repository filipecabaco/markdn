/**
 * Which line a document rides. Every top-level folder is a line, drawn in one of
 * three inks, and documents at the root ride the scarlet main line. Scarlet is the
 * main line's alone, so no folder can be mistaken for it.
 *
 * Assigned by the folder's name rather than its position in a listing, so a
 * folder keeps its colour when another one is added beside it — the way a line
 * keeps its colour when the network grows.
 */
export type LineInk = "scarlet" | "cobalt" | "amber" | "green";

const BRANCH_INKS: LineInk[] = ["cobalt", "amber", "green"];

export function lineFor(path: string | null): LineInk {
  if (!path || !path.includes("/")) return "scarlet";
  const folder = path.slice(0, path.indexOf("/"));

  let hash = 0;
  for (const char of folder) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return BRANCH_INKS[hash % BRANCH_INKS.length];
}

/** The folder a path's line is named for, as signage shows it. */
export function lineName(path: string | null): string {
  if (!path || !path.includes("/")) return "Main line";
  return path.slice(0, path.indexOf("/"));
}

/** The station: the document's own name, without its extension. */
export function stationName(path: string | null): string {
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
 * The document's stations: its headings, levels 1–3, in order. Read from the
 * source rather than the render so the line exists in Source view too, and a
 * `#` inside a fenced block is code, not a station.
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
 * the new one. Used to put a service alert on the stations an agent's write
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

/** The stations whose sections overlap a changed range. */
export function stationsIn(headings: Heading[], range: [number, number]): Set<number> {
  const touched = new Set<number>();
  headings.forEach((heading, index) => {
    const sectionEnd = (headings[index + 1]?.line ?? Number.MAX_SAFE_INTEGER) - 1;
    if (heading.line <= range[1] && sectionEnd >= range[0]) touched.add(heading.line);
  });
  // A change above the first heading belongs to the first station.
  if (touched.size === 0 && headings.length > 0) touched.add(headings[0].line);
  return touched;
}
