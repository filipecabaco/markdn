import { useEffect, useState } from "react";
import { Mermaid } from "./Mermaid";

/**
 * Fenced code block: mermaid diagrams render as diagrams, everything else is
 * highlighted with Shiki.
 *
 * Highlighting runs here rather than as a rehype plugin because Shiki is async
 * and `react-markdown` runs its processor synchronously — an async rehype plugin
 * (rehype-pretty-code) silently produces unhighlighted output in that pipeline.
 */

let shiki: Promise<typeof import("shiki")> | null = null;

function loadShiki() {
  if (!shiki) shiki = import("shiki");
  return shiki;
}

export interface CodeBlockProps {
  language: string | null;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadShiki()
      .then(({ codeToHtml }) =>
        codeToHtml(code, {
          // Shiki lazy-loads grammars; an unknown language falls back to plain text.
          lang: language ?? "text",
          themes: { light: "github-light", dark: "github-dark" },
          defaultColor: false,
        }),
      )
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        // Highlighting is decorative — on failure the plain fallback below stays.
        if (!cancelled) setHtml(null);
      });

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  if (language === "mermaid") return <Mermaid chart={code} />;

  // Shiki escapes the source it highlights, so its output is safe to inject.
  if (html) return <div className="code-block" dangerouslySetInnerHTML={{ __html: html }} />;

  return (
    <pre className="code-block code-block--plain">
      <code>{code}</code>
    </pre>
  );
}
