/**
 * Subsequence matching for the command palette.
 *
 * Deliberately the same algorithm and the same weights as `Markdn.Fuzzy` on the
 * server: files are ranked there because the server is the one walking the tree,
 * commands are ranked here because they never leave the browser, and a palette
 * that ordered its two halves by different rules would feel broken.
 */

/** Characters after which the next character starts a new word. */
const SEPARATORS = new Set(["/", "-", "_", ".", " "]);

const CONSECUTIVE = 10;
const BOUNDARY = 8;
const FIRST_CHAR = 9;
const GAP = -1;

export interface FuzzyMatch {
  score: number;
  /** Indices in `target` that the query landed on, for highlighting. */
  matches: number[];
}

/**
 * Scores `query` against `target`, or returns null when it does not match.
 *
 * An empty query matches everything with a neutral score, so an untouched
 * palette shows its full list.
 */
export function fuzzyMatch(target: string, query: string): FuzzyMatch | null {
  if (query === "") return { score: 0, matches: [] };

  const haystack = target.toLowerCase();
  const needle = query.toLowerCase();

  const matches: number[] = [];
  let score = 0;
  let lastHit = -2;
  let cursor = 0;

  for (let i = 0; i < haystack.length && cursor < needle.length; i += 1) {
    if (haystack[i] !== needle[cursor]) {
      score += GAP;
      continue;
    }

    if (lastHit === i - 1) score += CONSECUTIVE;
    else if (i === 0) score += FIRST_CHAR;
    else if (SEPARATORS.has(haystack[i - 1])) score += BOUNDARY;

    score += 1;
    matches.push(i);
    lastHit = i;
    cursor += 1;
  }

  return cursor === needle.length ? { score, matches } : null;
}
