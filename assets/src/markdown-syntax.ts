/**
 * Markdown tokenizer for the source editor's highlight layer.
 *
 * Hand-written rather than Shiki, which already highlights the *rendered* code
 * blocks. The difference is that this runs under a textarea whose own text is
 * transparent: the layer is the text the user sees, so it has to be produced
 * synchronously on every keystroke. Shiki is async — one frame of stale output
 * is one frame of the wrong characters, not one frame of the wrong colour.
 *
 * The output is a flat, sorted, non-overlapping list of ranges. Flat is a
 * deliberate limit: `**bold `code`**` colours as bold throughout rather than
 * nesting. Source highlighting exists to show structure at a glance, and a
 * tokenizer that tried to be a parser would be a second markdown implementation
 * to keep in step with the renderer.
 */

export type TokenKind =
  /** Structural punctuation: `#`, `>`, bullets, fences, emphasis delimiters. */
  | "marker"
  | "heading"
  | "strong"
  | "emphasis"
  | "strike"
  | "code"
  | "link"
  | "url"
  | "html"
  | "rule";

export interface Token {
  start: number;
  end: number;
  kind: TokenKind;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING = /^(\s{0,3})(#{1,6})(?=\s|$)/;
const RULE = /^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/;
const QUOTE = /^\s{0,3}>+\s?/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)/;
const TASK = /^\[[ xX]\]\s/;
const TAG = /^<\/?[A-Za-z][^<>]*>/;
const AUTOLINK = /^<[a-zA-Z][a-zA-Z0-9+.-]*:[^<>\s]+>/;
const BARE_URL = /^https?:\/\/[^\s<>()[\]]+/;

/** Characters a `_` may follow and still open emphasis; `snake_case` must not. */
const WORD = /[\p{L}\p{N}]/u;

export function tokenizeMarkdown(text: string): Token[] {
  const out: Token[] = [];
  const lines = text.split("\n");

  let offset = 0;
  let fence: string | null = null;
  let frontmatter = lines[0]?.trim() === "---";

  for (const [index, line] of lines.entries()) {
    if (frontmatter) {
      // Delimiters read as structure, the body as data. Both are metadata rather
      // than prose, so neither gets prose colour.
      push(out, offset, offset + line.length, index === 0 ? "marker" : "code");
      if (index > 0 && line.trim() === "---") frontmatter = false;
    } else if (fence !== null) {
      push(out, offset, offset + line.length, "code");
      if (line.trimStart().startsWith(fence)) fence = null;
    } else {
      const opening = FENCE.exec(line);

      if (opening) {
        fence = opening[1];
        push(out, offset, offset + line.length, "code");
      } else {
        scanLine(line, offset, out);
      }
    }

    offset += line.length + 1;
  }

  return out;
}

function scanLine(line: string, base: number, out: Token[]) {
  if (line.trim() === "") return;

  if (RULE.test(line)) {
    push(out, base, base + line.length, "rule");
    return;
  }

  const heading = HEADING.exec(line);

  if (heading) {
    const start = base + heading[1].length;
    push(out, start, start + heading[2].length, "marker");
    push(out, start + heading[2].length, base + line.length, "heading");
    return;
  }

  const quote = QUOTE.exec(line);

  if (quote) {
    // Recursed, not inlined: `> ## Heading` and `> - item` are both real, and the
    // part after the marker is an ordinary line.
    push(out, base, base + quote[0].length, "marker");
    scanLine(line.slice(quote[0].length), base + quote[0].length, out);
    return;
  }

  const list = LIST.exec(line);

  if (list) {
    const start = base + list[1].length;
    const consumed = list[0].length;
    push(out, start, base + consumed, "marker");

    const rest = line.slice(consumed);
    const task = TASK.exec(rest);
    if (task) push(out, base + consumed, base + consumed + 3, "marker");

    scanInline(line, base, base + consumed + (task ? 3 : 0), out);
    return;
  }

  // A table's delimiter row is punctuation only; its data rows keep their pipes
  // faint so the columns read as columns.
  if (line.includes("|") && /^[\s:|-]+$/.test(line) && line.includes("-")) {
    push(out, base, base + line.length, "marker");
    return;
  }

  scanInline(line, base, base, out);
}

/**
 * Walks `line` from absolute position `from`, emitting inline tokens.
 *
 * Positions are absolute throughout so the caller never has to rebase what comes
 * back, which is the mistake that puts a highlight one character off a hundred
 * lines down.
 */
function scanInline(line: string, base: number, from: number, out: Token[]) {
  let index = from - base;

  while (index < line.length) {
    const consumed =
      codeSpan(line, index, base, out) ??
      autolink(line, index, base, out) ??
      tag(line, index, base, out) ??
      linkOrImage(line, index, base, out) ??
      emphasis(line, index, base, out) ??
      strike(line, index, base, out) ??
      bareUrl(line, index, base, out) ??
      pipe(line, index, base, out);

    index += consumed ?? 1;
  }
}

function codeSpan(line: string, index: number, base: number, out: Token[]): number | null {
  if (line[index] !== "`") return null;

  let run = 1;
  while (line[index + run] === "`") run += 1;

  const close = line.indexOf("`".repeat(run), index + run);
  if (close === -1) return null;

  push(out, base + index, base + index + run, "marker");
  push(out, base + index + run, base + close, "code");
  push(out, base + close, base + close + run, "marker");
  return close + run - index;
}

function autolink(line: string, index: number, base: number, out: Token[]): number | null {
  const match = AUTOLINK.exec(line.slice(index));
  if (!match) return null;

  push(out, base + index, base + index + 1, "marker");
  push(out, base + index + 1, base + index + match[0].length - 1, "url");
  push(out, base + index + match[0].length - 1, base + index + match[0].length, "marker");
  return match[0].length;
}

function tag(line: string, index: number, base: number, out: Token[]): number | null {
  const match = TAG.exec(line.slice(index));
  if (!match) return null;

  push(out, base + index, base + index + match[0].length, "html");
  return match[0].length;
}

function linkOrImage(line: string, index: number, base: number, out: Token[]): number | null {
  const image = line[index] === "!" && line[index + 1] === "[";
  if (!image && line[index] !== "[") return null;

  const labelStart = index + (image ? 2 : 1);
  const labelEnd = closing(line, labelStart, "[", "]");
  if (labelEnd === -1) return null;

  push(out, base + index, base + labelStart, "marker");
  push(out, base + labelStart, base + labelEnd, "link");

  if (line[labelEnd + 1] !== "(") {
    // A reference link, or brackets that are just brackets. The label is still
    // worth marking; there is no destination to colour.
    push(out, base + labelEnd, base + labelEnd + 1, "marker");
    return labelEnd + 1 - index;
  }

  const destEnd = closing(line, labelEnd + 2, "(", ")");

  if (destEnd === -1) {
    push(out, base + labelEnd, base + labelEnd + 1, "marker");
    return labelEnd + 1 - index;
  }

  push(out, base + labelEnd, base + labelEnd + 2, "marker");
  push(out, base + labelEnd + 2, base + destEnd, "url");
  push(out, base + destEnd, base + destEnd + 1, "marker");
  return destEnd + 1 - index;
}

function emphasis(line: string, index: number, base: number, out: Token[]): number | null {
  const char = line[index];
  if (char !== "*" && char !== "_") return null;

  // `snake_case` and `__init__` are identifiers, not emphasis. `*` has no such
  // problem: nobody writes it inside a word.
  if (char === "_" && WORD.test(line[index - 1] ?? "")) return null;

  const delimiter = line[index + 1] === char ? char + char : char;
  const contentStart = index + delimiter.length;
  if (contentStart >= line.length || line[contentStart] === " ") return null;

  const close = line.indexOf(delimiter, contentStart);
  if (close === -1 || close === contentStart) return null;

  push(out, base + index, base + contentStart, "marker");
  push(out, base + contentStart, base + close, delimiter.length === 2 ? "strong" : "emphasis");
  push(out, base + close, base + close + delimiter.length, "marker");
  return close + delimiter.length - index;
}

function strike(line: string, index: number, base: number, out: Token[]): number | null {
  if (line[index] !== "~" || line[index + 1] !== "~") return null;

  const close = line.indexOf("~~", index + 2);
  if (close === -1) return null;

  push(out, base + index, base + index + 2, "marker");
  push(out, base + index + 2, base + close, "strike");
  push(out, base + close, base + close + 2, "marker");
  return close + 2 - index;
}

function bareUrl(line: string, index: number, base: number, out: Token[]): number | null {
  const match = BARE_URL.exec(line.slice(index));
  if (!match) return null;

  push(out, base + index, base + index + match[0].length, "url");
  return match[0].length;
}

function pipe(line: string, index: number, base: number, out: Token[]): number | null {
  if (line[index] !== "|") return null;

  push(out, base + index, base + index + 1, "marker");
  return 1;
}

/** Index of the bracket closing the one before `start`, honouring nesting. */
function closing(line: string, start: number, open: string, close: string): number {
  let depth = 1;

  for (let index = start; index < line.length; index += 1) {
    if (line[index] === "\\") index += 1;
    else if (line[index] === open) depth += 1;
    else if (line[index] === close && (depth -= 1) === 0) return index;
  }

  return -1;
}

function push(out: Token[], start: number, end: number, kind: TokenKind) {
  if (end > start) out.push({ start, end, kind });
}

export interface TextRange {
  start: number;
  end: number;
}

/**
 * Renders `text` as the editor's highlight layer, with `hits` marked.
 *
 * Returns an HTML string rather than React elements. A document is tens of
 * thousands of tokens, and building that many elements on every keystroke costs
 * more in reconciliation than the browser spends parsing the equivalent markup
 * in one pass. Everything interpolated here is escaped by `escape/1` below and
 * every class name is a literal, so there is nothing in the output the document
 * could have chosen.
 *
 * `hits` must be sorted and non-overlapping.
 */
export function highlightMarkdown(text: string, hits: readonly TextRange[] = []): string {
  const tokens = tokenizeMarkdown(text);
  const bounds = new Set<number>([0, text.length]);

  for (const token of tokens) {
    bounds.add(token.start);
    bounds.add(token.end);
  }

  for (const hit of hits) {
    bounds.add(hit.start);
    bounds.add(hit.end);
  }

  const points = [...bounds].sort((a, b) => a - b);
  let html = "";
  let token = 0;
  let hit = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];

    while (token < tokens.length && tokens[token].end <= start) token += 1;
    while (hit < hits.length && hits[hit].end <= start) hit += 1;

    const covering = tokens[token];
    const kind = covering !== undefined && covering.start <= start ? covering.kind : null;
    const marked = hits[hit] !== undefined && hits[hit].start <= start;
    const classes = [kind && `md-${kind}`, marked && "source__hit"].filter(Boolean).join(" ");
    const chunk = escape(text.slice(start, end));

    html += classes ? `<span class="${classes}">${chunk}</span>` : chunk;
  }

  // A trailing newline is not rendered by `white-space: pre-wrap`, but the
  // textarea over the top does keep a line for it. Without this the two scroll
  // out of step by one line at the bottom of every document that ends properly.
  return text.endsWith("\n") ? `${html}\n` : html;
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
