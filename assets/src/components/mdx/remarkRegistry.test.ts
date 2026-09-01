import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { remarkComponentRegistry } from "./remarkRegistry";

/**
 * These run the real unified pipeline rather than hand-building an mdast, so the
 * assertions cover what react-markdown actually receives.
 */
function render(markdown: string): string {
  return String(
    unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(remarkComponentRegistry)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeStringify, { allowDangerousHtml: true })
      .processSync(markdown),
  );
}

function propsOf(html: string): Record<string, unknown> {
  const match = /data-mdx-props="([^"]*)"/.exec(html);
  if (!match) throw new Error(`no props in: ${html}`);
  // The serializer escapes quotes as &#x22;.
  return JSON.parse(match[1].replace(/&#x22;/g, '"').replace(/&quot;/g, '"'));
}

describe("remarkComponentRegistry", () => {
  it("routes a capitalised component through mdx-node", () => {
    const html = render('<Alert type="warning" />');
    expect(html).toContain("<mdx-node");
    expect(html).toContain('data-mdx-name="Alert"');
    expect(propsOf(html)).toEqual({ type: "warning" });
  });

  it("leaves a lowercase JSX name as a real HTML element", () => {
    // JSX rules: lowercase is an intrinsic element, not a component. Routing it
    // through the registry made every <kbd> render as "unknown component".
    const html = render("Press <kbd>Cmd</kbd> now.");
    expect(html).toContain("<kbd>Cmd</kbd>");
    expect(html).not.toContain("mdx-node");
  });

  it("parses JSON expression props", () => {
    const html = render('<Card title="x" count={3} items={["a","b"]} flag={true} />');
    expect(propsOf(html)).toEqual({ title: "x", count: 3, items: ["a", "b"], flag: true });
  });

  it("treats a valueless attribute as boolean true", () => {
    expect(propsOf(render("<Alert dismissible />"))).toEqual({ dismissible: true });
  });

  it("drops a non-JSON expression instead of evaluating it", () => {
    // The whole point of the JSON.parse approach: arbitrary expressions never run.
    const html = render("<Alert count={1 + 1} />");
    expect(propsOf(html)).toEqual({});
    expect(html).toContain('data-mdx-dropped="count"');
  });

  it("reports a spread it cannot resolve", () => {
    const html = render("<Alert {...rest} />");
    expect(html).toContain("data-mdx-dropped");
  });

  it("keeps children of a component", () => {
    const html = render("<Alert type=\"info\">\n  hello **world**\n</Alert>");
    expect(html).toContain("<strong>world</strong>");
  });

  it("preserves camelCase prop names through hast", () => {
    // hast lowercases real HTML attributes; serialising props as JSON is what
    // keeps defaultValue from arriving as defaultvalue.
    expect(propsOf(render('<Tabs defaultValue="one" />'))).toEqual({ defaultValue: "one" });
  });
});
