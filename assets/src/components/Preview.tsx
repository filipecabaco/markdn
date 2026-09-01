import { useMemo, type ReactNode, type Ref } from "react";
import { resolveAssetUrl } from "../resolveAssetUrl";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import { CodeBlock } from "./CodeBlock";
import { ErrorBoundary } from "./ErrorBoundary";
import { MdxNode } from "./mdx/MdxNode";
import { remarkComponentRegistry } from "./mdx/remarkRegistry";
import { rehypeSourcePositions } from "./mdx/rehypeSourcePositions";

/**
 * Renders a document.
 *
 * Two pipelines. The MDX one understands `<Alert>` and friends; the plain one is
 * GFM only. MDX is tried first for every document — components should work in
 * `.md` too — and a parse failure falls back to plain rendering rather than
 * showing nothing, because a stray `<` or `{` is valid markdown but invalid MDX.
 */

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

interface PreviewProps {
  content: string;
  scrollerRef?: Ref<HTMLDivElement>;
  onScroll?: () => void;
  activeLine?: number | null;
  /** The open document's path. Relative image references resolve against it. */
  documentPath?: string | null;
}

export function Preview({
  content,
  scrollerRef,
  onScroll,
  activeLine,
  documentPath = null,
}: PreviewProps) {
  const components = useMemo(
    () => ({
      ...COMPONENTS,
      img: ({ src, alt, title }: ImageProps) => (
        <img
          className="preview__image"
          src={resolveAssetUrl(src, documentPath)}
          alt={alt ?? ""}
          title={title}
          loading="lazy"
        />
      ),
    }),
    [documentPath],
  ) as never;

  const plain = useMemo(
    () => (
      <Markdown
        remarkPlugins={[remarkGfm]}
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
            <div className="mdx-warning" role="note">
              <strong>MDX could not be parsed — showing plain markdown.</strong>
              <span>{error.message}</span>
            </div>
            {plain}
          </>
        )}
      >
        <Markdown
          remarkPlugins={[remarkGfm, remarkMdx, remarkComponentRegistry]}
          rehypePlugins={[rehypeSourcePositions]}
          components={components}
        >
          {content}
        </Markdown>
      </ErrorBoundary>
    </div>
  );
}
