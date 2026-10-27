import { useLayoutEffect, useMemo, useState, type ReactNode, type Ref, type RefObject } from "react";
import { resolveAssetUrl } from "../resolveAssetUrl";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { CodeBlock } from "./CodeBlock";
import { ErrorBoundary } from "./ErrorBoundary";
import { MdxNode } from "./mdx/MdxNode";
import { COMPONENT_NAMES } from "./mdx/registry";
import { remarkComponentRegistry } from "./mdx/remarkRegistry";
import { rehypeSourcePositions } from "./mdx/rehypeSourcePositions";

/**
 * Renders a document.
 *
 * Two pipelines. The MDX one understands `<Alert>` and friends; the plain one is
 * GFM plus raw HTML. MDX is tried first for every document — components should
 * work in `.md` too — and a parse failure falls back to plain rendering rather
 * than showing nothing, because a stray `<` or `{` is valid markdown but invalid
 * MDX.
 *
 * The fallback renders HTML rather than printing it, because a README full of
 * `<p align="center">` and unclosed `<img>` tags is *correct* markdown — it is
 * only MDX that requires every tag to close — and showing its source is showing
 * the wrong document. Raw HTML from a file the user opened is still untrusted:
 * this window can read and write their disk through the local API, so a
 * `<script>` or an `onerror=` in a document would be running with those hands.
 * Everything raw is therefore sanitised before it is rendered.
 */

// GitHub's schema, plus the layout attributes that decorate a README. `align`
// and `width` on an image cannot execute anything; they are the difference
// between a centred badge row and a ragged column of icons.
export const SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img ?? []), "width", "height", "align"],
    p: [...(defaultSchema.attributes?.p ?? []), "align"],
    div: [...(defaultSchema.attributes?.div ?? []), "align"],
    h1: [...(defaultSchema.attributes?.h1 ?? []), "align"],
    h2: [...(defaultSchema.attributes?.h2 ?? []), "align"],
    h3: [...(defaultSchema.attributes?.h3 ?? []), "align"],
  },
};

// An MDX parse error is only worth reporting on a document that meant to be MDX.
// A `.md` file whose HTML does not close every tag is not broken, and a banner
// over it is the interface being wrong out loud.
const COMPONENT_TAG = new RegExp(`</?(${COMPONENT_NAMES.join("|")})[\\s/>]`);
const ESM = /^(import|export)\s/m;

function intendsMdx(content: string, path: string | null): boolean {
  if (path !== null && /\.mdx$/i.test(path)) return true;
  return COMPONENT_TAG.test(content) || ESM.test(content);
}

interface CodeProps {
  className?: string;
  children?: ReactNode;
}

interface PreProps {
  children?: ReactNode;
  "data-line"?: string;
  "data-block"?: string;
}

// `pre` is unwrapped because CodeBlock renders its own <pre>; leaving it in place
// would nest one inside another.
const COMPONENTS = {
  "mdx-node": MdxNode,
  // CodeBlock renders its own <pre>, so this must not nest another one. It stays
  // a real element rather than a fragment because mdast puts the fenced block's
  // source position here, and the sync rail needs something to measure.
  pre: ({ children, ...position }: PreProps) => (
    <div className="block" data-line={position["data-line"]} data-block={position["data-block"]}>
      {children}
    </div>
  ),
  code: ({ className, children, ...props }: CodeProps) => {
    const language = /language-(\w+)/.exec(className ?? "")?.[1] ?? null;
    const text = String(children ?? "").replace(/\n$/, "");

    // An indented or unlabelled fenced block has no language class, so a newline
    // is what distinguishes it from inline code.
    if (language || text.includes("\n")) {
      return <CodeBlock language={language} code={text} />;
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

interface ImageProps {
  src?: string;
  alt?: string;
  title?: string;
}

/**
 * A document image, or — when it does not load — a line naming the reference
 * that failed, so a typo in a path is findable from the render. Keyed on the
 * resolved URL by the caller, so fixing the path retries.
 */
function PreviewImage({ src, alt, title, url }: ImageProps & { url: string | undefined }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="preview__missing" role="img" aria-label={alt || "Image not found"}>
        Image not found: <code>{src}</code>
      </span>
    );
  }

  return (
    <img
      className="preview__image"
      src={url}
      alt={alt ?? ""}
      title={title}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

interface PreviewProps {
  content: string;
  scrollerRef?: Ref<HTMLDivElement>;
  onScroll?: () => void;
  activeLine?: number | null;
  /** The open document's path. Relative image references resolve against it. */
  documentPath?: string | null;
  /**
   * Written with how long rendering new content took, parse and commit
   * together, so the caller can pace updates to what this document costs.
   */
  renderCost?: RefObject<number>;
}

export function Preview({
  content,
  scrollerRef,
  onScroll,
  activeLine,
  documentPath = null,
  renderCost,
}: PreviewProps) {
  // Children's layout effects run before this component's, so the span from
  // here to the effect below covers the markdown subtree rendering and
  // committing — the whole price of a content change.
  const started = performance.now();
  useLayoutEffect(() => {
    if (renderCost) renderCost.current = performance.now() - started;
    // Measured only when the content changed; other renders are not the cost.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  const components = useMemo(
    () => ({
      ...COMPONENTS,
      img: ({ src, alt, title }: ImageProps) => {
        const url = resolveAssetUrl(src, documentPath);
        return <PreviewImage key={url} src={src} alt={alt} title={title} url={url} />;
      },
    }),
    [documentPath],
  ) as never;

  // Order is load-bearing: raw HTML has to become elements before it can be
  // sanitised, and the source positions are stamped last so the sanitiser does
  // not strip the `data-line` attributes the sync rail navigates by.
  const plain = useMemo(
    () => (
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, SCHEMA], rehypeSourcePositions]}
        components={components}
      >
        {content}
      </Markdown>
    ),
    [components, content],
  );

  // Memoised like `plain`, and for a bigger reason: this is the render that
  // shows. Rebuilt on every Preview render, it re-parsed the whole document
  // whenever anything above re-rendered — the caret moving, the line offsets
  // landing — 60ms a time on a long file, for output that had not changed.
  const mdx = useMemo(
    () => (
      <Markdown
        remarkPlugins={[remarkGfm, remarkMdx, remarkComponentRegistry]}
        rehypePlugins={[rehypeSourcePositions]}
        components={components}
      >
        {content}
      </Markdown>
    ),
    [components, content],
  );

  return (
    <div
      className="preview"
      ref={scrollerRef}
      onScroll={onScroll}
      data-active-line={activeLine ?? undefined}
    >
      <ErrorBoundary
        key={content}
        fallback={(error) => (
          <>
            {intendsMdx(content, documentPath) && (
              <div className="mdx-warning" role="note">
                <strong>MDX could not be parsed — showing plain markdown.</strong>
                <span>{error.message}</span>
              </div>
            )}
            {plain}
          </>
        )}
      >
        {mdx}
      </ErrorBoundary>
    </div>
  );
}
