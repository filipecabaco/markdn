import { describe, expect, it } from "vitest";
import { patchLines } from "./patchLines";

function layer(lines: string[]) {
  const container = document.createElement("div");
  patchLines(container, [], lines, (element, line) => {
    element.textContent = line;
  });
  return container;
}

const text = (container: HTMLElement) => [...container.children].map((c) => c.textContent);

describe("patchLines", () => {
  it("rewrites only the line that changed, keeping its neighbours' elements", () => {
    const container = layer(["a", "b", "c"]);
    const [first, , last] = [...container.children];
    let writes = 0;

    patchLines(container, ["a", "b", "c"], ["a", "B", "c"], (element, line) => {
      writes += 1;
      element.textContent = line;
    });

    expect(text(container)).toEqual(["a", "B", "c"]);
    expect(writes).toBe(1);
    expect(container.children[0]).toBe(first);
    expect(container.children[2]).toBe(last);
  });

  it("inserts and removes lines in the middle", () => {
    const container = layer(["a", "b", "c"]);
    const write = (element: HTMLElement, line: string) => {
      element.textContent = line;
    };

    patchLines(container, ["a", "b", "c"], ["a", "b", "x", "y", "c"], write);
    expect(text(container)).toEqual(["a", "b", "x", "y", "c"]);

    patchLines(container, ["a", "b", "x", "y", "c"], ["a", "c"], write);
    expect(text(container)).toEqual(["a", "c"]);
  });

  it("handles a document replaced wholesale, and emptied", () => {
    const container = layer(["one", "two"]);
    const write = (element: HTMLElement, line: string) => {
      element.textContent = line;
    };

    patchLines(container, ["one", "two"], ["x", "y", "z"], write);
    expect(text(container)).toEqual(["x", "y", "z"]);

    patchLines(container, ["x", "y", "z"], [], write);
    expect(container.children).toHaveLength(0);
  });
});
