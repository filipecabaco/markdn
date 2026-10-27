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
let theme: import("shiki").ThemeRegistration | null = null;

function loadShiki() {
  if (!shiki) shiki = import("shiki");
  return shiki;
}

/**
 * One theme whose colours are CSS variables, mapped onto the source pane's
 * syntax tokens in styles.css. A stock theme brings its own palette — GitHub's
 * keyword red is the signal colour, and fails contrast on the panel — and two
 * of them meant swapping themes with `!important` overrides per scheme.
 */
function codeTheme(module: typeof import("shiki")) {
  theme ??= module.createCssVariablesTheme({ name: "markdn", variablePrefix: "--code-" });
  return theme;
}

export interface CodeBlockProps {
  language: string | null;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    // A diagram is drawn, not highlighted: loading Shiki for it fetched and
    // compiled a 600 kB regex engine on documents with no code in them at all.
    if (language === "mermaid") return;

    let cancelled = false;

    loadShiki()
      .then((module) =>
        module.codeToHtml(code, {
          // Shiki lazy-loads grammars; an unknown language falls back to plain text.
          lang: language ?? "text",
          theme: codeTheme(module),
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
