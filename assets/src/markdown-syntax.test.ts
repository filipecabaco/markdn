import { describe, expect, it } from "vitest";
import { highlightMarkdown, tokenizeMarkdown } from "./markdown-syntax";

/** Tokens as `[kind, the text it covers]`, which is what a highlight layer is. */
function tokens(text: string) {
  return tokenizeMarkdown(text).map((token) => [token.kind, text.slice(token.start, token.end)]);
}

describe("tokenizeMarkdown", () => {
  it("separates a heading's hashes from its text", () => {
    expect(tokens("## Title")).toEqual([
      ["marker", "##"],
      ["heading", " Title"],
    ]);
  });

  it("marks emphasis delimiters apart from their content", () => {
    expect(tokens("a **bold** and *thin*")).toEqual([
      ["marker", "**"],
      ["strong", "bold"],
      ["marker", "**"],
      ["marker", "*"],
      ["emphasis", "thin"],
      ["marker", "*"],
    ]);
  });

  it("leaves snake_case alone", () => {
    // The underscore rule is the whole reason `_` is treated differently from
    // `*`: source documents are full of identifiers.
    expect(tokens("call some_long_name here")).toEqual([]);
  });

  it("splits a link into label and destination", () => {
    expect(tokens("see [the docs](https://example.com) now")).toEqual([
      ["marker", "["],
      ["link", "the docs"],
      ["marker", "]("],
      ["url", "https://example.com"],
      ["marker", ")"],
    ]);
  });

  it("treats an image like a link, including the bang", () => {
    expect(tokens("![alt](a.png)")).toEqual([
      ["marker", "!["],
      ["link", "alt"],
      ["marker", "]("],
      ["url", "a.png"],
      ["marker", ")"],
    ]);
  });

  it("covers a fenced block, its fences and its contents", () => {
    expect(tokens("```elixir\ndef a, do: **not bold**\n```")).toEqual([
      ["code", "```elixir"],
      ["code", "def a, do: **not bold**"],
      ["code", "```"],
    ]);
  });

  it("does not close a fence on a different fence character", () => {
    expect(tokens("```\n~~~\ntext")).toEqual([
      ["code", "```"],
      ["code", "~~~"],
      ["code", "text"],
    ]);
  });

  it("marks an inline code span without touching what is inside it", () => {
    expect(tokens("run `mix test` twice")).toEqual([
      ["marker", "`"],
      ["code", "mix test"],
      ["marker", "`"],
    ]);
  });

  it("marks list bullets and task boxes", () => {
    expect(tokens("- [x] done")).toEqual([
      ["marker", "- "],
      ["marker", "[x]"],
    ]);
  });

  it("recurses through a blockquote prefix", () => {
    expect(tokens("> ## Quoted")).toEqual([
      ["marker", "> "],
      ["marker", "##"],
      ["heading", " Quoted"],
    ]);
  });

  it("marks HTML and MDX tags", () => {
    expect(tokens('<Alert type="info">')).toEqual([["html", '<Alert type="info">']]);
  });

  it("treats leading frontmatter as metadata", () => {
    expect(tokens("---\ntitle: A\n---\n# Body")).toEqual([
      ["marker", "---"],
      ["code", "title: A"],
      ["code", "---"],
      ["marker", "#"],
      ["heading", " Body"],
    ]);
  });

  it("reads a thematic break that is not at the top as a rule", () => {
    expect(tokens("text\n\n---")).toEqual([["rule", "---"]]);
  });

  it("returns ranges in order and never overlapping", () => {
    const source = "# T\n\n- a **b** [c](d) `e` <f>\n\n> q\n\n```\nz\n```\n";
    let previous = 0;

    for (const token of tokenizeMarkdown(source)) {
      expect(token.start).toBeGreaterThanOrEqual(previous);
      expect(token.end).toBeGreaterThan(token.start);
      previous = token.end;
    }
  });
});

describe("highlightMarkdown", () => {
  it("escapes the document rather than emitting it as markup", () => {
    const html = highlightMarkdown("a < b & c\n");
    expect(html).toContain("a &lt; b &amp; c");
    expect(html).not.toContain("<b");
  });

  it("marks hits, including inside a token", () => {
    const html = highlightMarkdown("## Title", [{ start: 3, end: 5 }]);
    expect(html).toContain('<span class="md-heading source__hit">Ti</span>');
  });

  it("keeps a trailing newline so the layer and the textarea stay in step", () => {
    expect(highlightMarkdown("a\n").endsWith("\n")).toBe(true);
    expect(highlightMarkdown("a").endsWith("\n")).toBe(false);
  });
});
