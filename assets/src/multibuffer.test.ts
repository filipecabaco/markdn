import { describe, expect, it } from "vitest";
import { CONTEXT_LINES, excerpts, findMatches, join, replaceAll } from "./multibuffer";

const document = [
  "line 1",
  "line 2",
  "line 3",
  "line 4 needle",
  "line 5",
  "line 6",
  "line 7",
  "line 8",
  "line 9",
  "line 10 needle",
  "line 11",
].join("\n");

describe("findMatches", () => {
  it("finds every occurrence in order", () => {
    expect(findMatches("a b a b a", "a", true)).toEqual([
      { start: 0, end: 1 },
      { start: 4, end: 5 },
      { start: 8, end: 9 },
    ]);
  });

  it("ignores case unless asked", () => {
    expect(findMatches("Needle", "needle", false)).toEqual([{ start: 0, end: 6 }]);
    expect(findMatches("Needle", "needle", true)).toEqual([]);
  });

  it("never overlaps, so a hit is never underlined twice", () => {
    expect(findMatches("aaaa", "aa", true)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });
});

describe("excerpts", () => {
  it("round-trips the document it split", () => {
    // The property the whole feature rests on: what is written back is the file,
    // not a reconstruction of the part that was on screen.
    for (const source of [document, "", "one line", "trailing\n", "\n\nblank\n\n"]) {
      expect(join(excerpts(source, "needle", false))).toBe(source);
    }
  });

  it("shows context around each match and hides the rest", () => {
    const segments = excerpts(document, "needle", false);
    const shown = segments.filter((segment) => segment.kind === "excerpt");

    expect(shown).toHaveLength(2);
    expect(shown[0].text).toBe(["line 2", "line 3", "line 4 needle", "line 5", "line 6"].join("\n"));
    expect(shown[0].text.split("\n")).toHaveLength(CONTEXT_LINES * 2 + 1);
  });

  it("merges matches whose context would overlap", () => {
    const near = ["a needle", "b", "c needle", "d"].join("\n");
    const shown = excerpts(near, "needle", false).filter((s) => s.kind === "excerpt");

    expect(shown).toHaveLength(1);
    expect(shown[0].text).toBe(near);
  });

  it("keeps a file with no match whole and unshown", () => {
    const segments = excerpts("nothing here", "needle", false);
    expect(segments).toEqual([{ kind: "gap", text: "nothing here" }]);
  });

  it("survives an edit that changes an excerpt's line count", () => {
    const segments = excerpts(document, "needle", false);
    const edited = segments.map((segment) =>
      segment.kind === "excerpt" && segment.text.includes("line 4")
        ? { ...segment, text: `${segment.text}\nadded` }
        : segment,
    );

    expect(join(edited)).toContain("line 6\nadded\nline 7");
    expect(join(edited)).toContain("line 10 needle");
  });
});

describe("replaceAll", () => {
  it("replaces every occurrence literally", () => {
    expect(replaceAll("a.b.c", ".", "-", true)).toBe("a-b-c");
  });

  it("does not treat the query as a pattern", () => {
    expect(replaceAll("a.b", ".*", "x", true)).toBe("a.b");
  });

  it("honours case sensitivity", () => {
    expect(replaceAll("Needle needle", "needle", "pin", false)).toBe("pin pin");
    expect(replaceAll("Needle needle", "needle", "pin", true)).toBe("Needle pin");
  });
});
