import { afterEach, describe, expect, it, vi } from "vitest";
import { copyRich, notionHtml } from "./notionExport";

describe("notionHtml", () => {
  it("keeps the structure Notion builds blocks from", async () => {
    const html = await notionHtml(
      "# Title\n\nSome **bold** and a [link](https://x.y).\n\n- one\n- two\n\n| A | B |\n|---|---|\n| 1 | 2 |\n",
    );

    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<a href="https://x.y">link</a>');
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>2</td>");
  });

  it("turns alerts and callouts into a quote led by their bold title", async () => {
    const html = await notionHtml(
      '<Alert type="warning" title="Careful">Mind the step.</Alert>\n\n<Callout type="tip">A tip.</Callout>\n',
    );

    expect(html).toMatch(/<blockquote><p><strong>Careful<\/strong><\/p>.*Mind the step\./s);
    expect(html).toMatch(/<blockquote><p><strong>Tip<\/strong><\/p>.*A tip\./s);
  });

  it("keeps every tab, not just the one the preview shows", async () => {
    const html = await notionHtml(
      '<Tabs defaultValue="a">\n  <Tab value="a" label="First">One.</Tab>\n  <Tab value="b" label="Second">Two.</Tab>\n</Tabs>\n',
    );

    expect(html).toContain("<h4>First</h4>");
    expect(html).toContain("<h4>Second</h4>");
    expect(html).toContain("One.");
    expect(html).toContain("Two.");
  });

  it("writes code, mermaid included, as a code block with its language", async () => {
    const html = await notionHtml(
      "```ts\nconst a = 1;\n```\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nand `inline`.\n",
    );

    expect(html).toContain('<pre><code class="language-ts">const a = 1;</code></pre>');
    expect(html).toContain('<code class="language-mermaid">flowchart LR\n  A --&gt; B</code>');
    expect(html).toContain("<code>inline</code>");
  });

  it("names a local image instead of embedding a link Notion cannot fetch", async () => {
    const html = await notionHtml("![diagram](./img/flow.png)\n\n![remote](https://x.y/a.png)\n");

    expect(html).toContain("<em>Image: diagram</em>");
    expect(html).toContain('<img src="https://x.y/a.png" alt="remote"/>');
  });

  it("falls back to plain markdown for a document that is not valid MDX", async () => {
    const html = await notionHtml("Three is 3 < 5, and {braces} are text.\n");

    expect(html).toContain("<p>");
    expect(html).toContain("3 &lt; 5");
  });
});

describe("copyRich", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copies synchronously, inside the gesture, when both halves are ready", async () => {
    const set: Record<string, string> = {};
    const write = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { write } });
    const exec = vi.fn(() => {
      const event = new Event("copy") as ClipboardEvent;
      Object.defineProperty(event, "clipboardData", {
        value: { setData: (type: string, value: string) => (set[type] = value) },
      });
      document.dispatchEvent(event);
      return true;
    });
    Object.defineProperty(document, "execCommand", { value: exec, configurable: true });

    const done = copyRich("<h1>T</h1>", "# T");
    // Already on the clipboard before any await could end the gesture.
    expect(exec).toHaveBeenCalledWith("copy");
    expect(set).toEqual({ "text/html": "<h1>T</h1>", "text/plain": "# T" });

    await done;
    expect(write).not.toHaveBeenCalled();
  });

  it("puts the HTML and the markdown on the clipboard together", async () => {
    const written: Record<string, Blob | Promise<Blob>>[] = [];
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(public items: Record<string, Blob | Promise<Blob>>) {
          written.push(items);
        }
      },
    );
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { write } });

    await copyRich(Promise.resolve("<h1>T</h1>"), Promise.resolve("# T"));

    expect(write).toHaveBeenCalledTimes(1);
    const items = written[0];
    expect(await (await items["text/html"]).text()).toBe("<h1>T</h1>");
    expect(await (await items["text/plain"]).text()).toBe("# T");
  });
});
