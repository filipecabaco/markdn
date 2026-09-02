/**
 * The text model behind the multibuffer.
 *
 * A searched file is split into an alternating list of segments: the excerpts
 * around its matches, which are editable and on screen, and the gaps between
 * them, which are neither. Editing only ever rewrites an excerpt's text, so
 * nothing has to track how a change of line count moves everything below it —
 * the file is always exactly `join(segments)`, before and after.
 *
 * That is the property the whole feature rests on: what gets written back is the
 * document, with the excerpts as the user left them, and not a reconstruction of
 * it from line numbers that stopped being true on the first keystroke.
 */

export interface Match {
  start: number;
  end: number;
}

export type Segment =
  | { kind: "gap"; text: string }
  | { kind: "excerpt"; text: string };

/** Lines of unmatched context kept on either side of a match. */
export const CONTEXT_LINES = 2;

/**
 * Every occurrence of `query` in `text`, in order and non-overlapping.
 *
 * Literal, matching the server's own `String.contains?`. The two have to agree:
 * the server decides which files come back, this decides what is underlined in
 * them, and a regex dialect between the two would show a file with nothing in it.
 */
export function findMatches(text: string, query: string, caseSensitive: boolean): Match[] {
  if (query === "") return [];

  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: Match[] = [];

  let from = 0;

  for (;;) {
    const start = haystack.indexOf(needle, from);
    if (start === -1) return matches;

    matches.push({ start, end: start + needle.length });
    from = start + needle.length;
  }
}

/**
 * Splits `contents` into gaps and the excerpts around every match.
 *
 * A file with no match is one gap: it still round-trips, which is what keeps
 * `join/1` total rather than a special case away from losing a document.
 */
export function excerpts(contents: string, query: string, caseSensitive: boolean): Segment[] {
  const lines = contents.split("\n");
  const ranges: [number, number][] = [];

  lines.forEach((line, index) => {
    if (findMatches(line, query, caseSensitive).length === 0) return;

    const start = Math.max(0, index - CONTEXT_LINES);
    const end = Math.min(lines.length - 1, index + CONTEXT_LINES);
    const previous = ranges[ranges.length - 1];

    // Two matches close together are one excerpt, not two overlapping ones that
    // would show the same lines twice and edit them independently.
    if (previous && start <= previous[1] + 1) previous[1] = Math.max(previous[1], end);
    else ranges.push([start, end]);
  });

  const segments: Segment[] = [];
  let cursor = 0;

  for (const [start, end] of ranges) {
    if (start > cursor) segments.push({ kind: "gap", text: lines.slice(cursor, start).join("\n") });
    segments.push({ kind: "excerpt", text: lines.slice(start, end + 1).join("\n") });
    cursor = end + 1;
  }

  if (cursor < lines.length) segments.push({ kind: "gap", text: lines.slice(cursor).join("\n") });

  return segments;
}

/** The document the segments came from, with any edits in place. */
export function join(segments: Segment[]): string {
  return segments.map((segment) => segment.text).join("\n");
}

/** Lines in `text`. A segment's length in lines is what places the next one. */
export function lineCount(text: string): number {
  return text.split("\n").length;
}

/** Replaces every occurrence of `query`, literally. */
export function replaceAll(
  text: string,
  query: string,
  replacement: string,
  caseSensitive: boolean,
): string {
  const matches = findMatches(text, query, caseSensitive);
  if (matches.length === 0) return text;

  let out = "";
  let cursor = 0;

  for (const match of matches) {
    out += text.slice(cursor, match.start) + replacement;
    cursor = match.end;
  }

  return out + text.slice(cursor);
}
