import type { ReactNode } from "react";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import { SCHEMA } from "./components/Preview";
import { remarkComponentRegistry } from "./components/mdx/remarkRegistry";

/**
 * A document as HTML that Notion turns into blocks on paste.
 *
 * Notion builds headings, lists, tables, quotes and code blocks from pasted
 * HTML, and does far less with pasted markdown — tables arrive as pipes, and
 * MDX not at all. So the document is rendered again, through the same remark
 * pipeline as the preview (one parser, so what pastes is what you saw), with
 * renderers that speak Notion's vocabulary instead of the app's:
 *
 *   - Alert and Callout become a quote whose first line is the bold title;
 *   - Card becomes a heading over its content;
 *   - Tabs become every tab's label and content — the preview only ever renders
 *     the active one, and a pasted page should not lose the others;
 *   - code, mermaid included, becomes a plain code block with its language;
 *   - an image the document serves from this machine becomes a line naming it:
 *     Notion fetches images itself and cannot reach localhost.
 */

interface NodeProps {
  children?: ReactNode;
  "data-mdx-name"?: string;
  "data-mdx-props"?: string;
}

function props(raw: string | undefined): Record<string, string> {
  try {
    const parsed = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, String(value ?? "")]),
    );
  } catch {
    return {};
  }
}

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

function NotionNode({ children, ...rest }: NodeProps) {
  const name = rest["data-mdx-name"];
  const p = props(rest["data-mdx-props"]);

  switch (name) {
    case "Alert":
    case "Callout":
      return (
        <blockquote>
          <p>
            <strong>{p.title || capitalise(p.type || (name === "Alert" ? "info" : "note"))}</strong>
          </p>
          {children}
        </blockquote>
      );
    case "Card":
      return (
        <>
          <h3>{p.title}</h3>
          {p.subtitle && (
            <p>
              <em>{p.subtitle}</em>
            </p>
          )}
          {children}
        </>
      );
    case "Tab":
      return (
        <>
          <h4>{p.label || p.value}</h4>
          {children}
        </>
      );
    default:
      // Tabs and anything unknown: their content, without a wrapper Notion
      // would have nothing to make of.
      return <>{children}</>;
  }
}

interface CodeProps {
  className?: string;
  children?: ReactNode;
}

interface ImageProps {
  src?: string;
  alt?: string;
}

const COMPONENTS = {
  "mdx-node": NotionNode,
  // `code` draws the whole block, so the <pre> around it adds nothing.
  pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
  code: ({ className, children }: CodeProps) => {
    const language = /language-(\w+)/.exec(className ?? "")?.[1] ?? null;
    const text = String(children ?? "").replace(/\n$/, "");

    if (!language && !text.includes("\n")) return <code>{children}</code>;

    return (
      <pre>
        <code className={language ? `language-${language}` : undefined}>{text}</code>
      </pre>
    );
  },
  img: ({ src, alt }: ImageProps) =>
    src && /^https?:\/\//.test(src) ? (
      <img src={src} alt={alt ?? ""} />
    ) : (
      <em>Image: {alt || src}</em>
    ),
} as never;

type Server = typeof import("react-dom/server");
let server: Server | null = null;
let loading: Promise<Server> | null = null;

/**
 * Fetches the string renderer ahead of need. Called once the app is idle, so
 * that copying the open document can render on the spot — the clipboard only
 * accepts a write made inside the click or keypress that asked for it, and an
 * import would end that window before the copy began.
 */
export function preloadNotionExport(): Promise<Server> {
  loading ??= import("react-dom/server").then((module) => (server = module));
  return loading;
}

/** The HTML now, if the renderer is already loaded; otherwise null. */
export function notionHtmlNow(content: string): string | null {
  return server ? render(server, content) : null;
}

export async function notionHtml(content: string): Promise<string> {
  return render(await preloadNotionExport(), content);
}

function render({ renderToStaticMarkup }: Server, content: string): string {
  try {
    return renderToStaticMarkup(
      <Markdown remarkPlugins={[remarkGfm, remarkMdx, remarkComponentRegistry]} components={COMPONENTS}>
        {content}
      </Markdown>,
    );
  } catch {
    // Not valid MDX — the same fallback the preview takes: plain markdown, with
    // raw HTML sanitised exactly as it is on screen.
    return renderToStaticMarkup(
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, SCHEMA]]}
        components={COMPONENTS}
      >
        {content}
      </Markdown>,
    );
  }
}

/**
 * Puts the rich and the plain version on the clipboard together: Notion (and
 * Docs, Mail…) take the HTML; anything that only understands text gets the
 * markdown source, which is the honest plain form of the document.
 *
 * The clipboard only takes a write made inside the click or keypress that
 * asked for it. So when both halves are already in hand, a copy event carries
 * them synchronously, there and then — the most widely honoured route, WebKit
 * included. When they are still on their way (a file being read from disk),
 * the ClipboardItem is created at once with promised blobs, which keeps the
 * write tied to the gesture while the content finishes.
 */
export async function copyRich(
  html: string | Promise<string>,
  text: string | Promise<string>,
): Promise<void> {
  if (typeof html === "string" && typeof text === "string" && copyNow(html, text)) return;

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": Promise.resolve(html).then((value) => new Blob([value], { type: "text/html" })),
          "text/plain": Promise.resolve(text).then((value) => new Blob([value], { type: "text/plain" })),
        }),
      ]);
      return;
    } catch {
      // Fall through to a last copy event.
    }
  }

  const [value, plain] = await Promise.all([html, text]);
  if (!copyNow(value, plain)) throw new Error("Could not copy to the clipboard.");
}

/** A synchronous copy event carrying both halves. False if it was refused. */
function copyNow(html: string, text: string): boolean {
  const onCopy = (event: ClipboardEvent) => {
    event.clipboardData?.setData("text/html", html);
    event.clipboardData?.setData("text/plain", text);
    event.preventDefault();
  };
  document.addEventListener("copy", onCopy, { once: true });
  const copied = document.execCommand?.("copy") ?? false;
  document.removeEventListener("copy", onCopy);
  return copied;
}
