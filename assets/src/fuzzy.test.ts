import { describe, expect, it } from "vitest";
import { fuzzyMatch } from "./fuzzy";

describe("fuzzyMatch", () => {
  it("matches a subsequence rather than a substring", () => {
    expect(fuzzyMatch("Toggle autoscroll", "tas")).not.toBeNull();
  });

  it("reports the matched positions", () => {
    expect(fuzzyMatch("Save document", "sav")?.matches).toEqual([0, 1, 2]);
  });

  it("rejects characters that are out of order", () => {
    expect(fuzzyMatch("Save document", "vs")).toBeNull();
  });

  it("returns a neutral match for an empty query", () => {
    expect(fuzzyMatch("anything", "")).toEqual({ score: 0, matches: [] });
  });

  it("ranks a contiguous run above scattered characters", () => {
    const run = fuzzyMatch("Settings", "set")?.score ?? 0;
    const scattered = fuzzyMatch("Speed test", "set")?.score ?? 0;
    expect(run).toBeGreaterThan(scattered);
  });

  it("ranks word starts above mid-word characters", () => {
    const boundary = fuzzyMatch("Insert component", "ic")?.score ?? 0;
    const middle = fuzzyMatch("Indices cached", "ic")?.score ?? 0;
    expect(boundary).toBeGreaterThan(middle);
  });
});
