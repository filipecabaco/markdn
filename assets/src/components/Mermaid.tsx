import { useEffect, useId, useRef, useState } from "react";
import { Notice } from "./mdx/Notice";

/**
 * Renders a mermaid diagram.
 *
 * mermaid is imported dynamically so its bulk never lands in the initial bundle
 * for documents that contain no diagrams.
 */

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidReady) mermaidReady = import("mermaid").then(({ default: mermaid }) => mermaid);
  return mermaidReady;
}

/**
 * A design token as the hex colour it paints. mermaid derives its shades with a
 * colour library that reads hex and rgb but not oklch, so each token is resolved
 * by painting one pixel with it. Undefined where there is no canvas (tests),
 * which leaves mermaid's own value in place.
 */
function tokenHex(name: string): string | undefined {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const probe = value ? document.createElement("canvas").getContext("2d") : null;
  if (!probe) return undefined;
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The diagram drawn on the document: its background, its text and its rules,
 * read at render time so it follows the theme setting as well as the OS one.
 * mermaid bakes its palette in at initialize, so this runs before every render.
 */
function themeFromTokens() {
  const surface = tokenHex("--background");
  const panel = tokenHex("--muted");
  const ink = tokenHex("--foreground");
  const muted = tokenHex("--muted-foreground");
  const rule = tokenHex("--ring");
  return {
    background: surface,
    mainBkg: panel,
    primaryColor: panel,
    secondaryColor: panel,
    tertiaryColor: surface,
    primaryTextColor: ink,
    textColor: ink,
    nodeTextColor: ink,
    primaryBorderColor: rule,
    nodeBorder: rule,
    lineColor: muted,
    edgeLabelBackground: surface,
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() || undefined,
  };
}

function themed(mermaid: typeof import("mermaid").default) {
  mermaid.initialize({
    startOnLoad: false,
    // 'strict' makes mermaid sanitise labels and refuse click handlers, which
    // matters because diagram source arrives from files this app did not write.
    securityLevel: "strict",
    theme: "base",
    themeVariables: themeFromTokens(),
  });
  return mermaid;
}

export function Mermaid({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // useId gives a unique id per instance; mermaid requires one per render call.
  const id = `mermaid-${useId().replace(/:/g, "")}`;
  // Guards against a slow render for an old diagram overwriting a newer one.
  const latest = useRef(0);

  useEffect(() => {
    const generation = ++latest.current;
    let cancelled = false;

    loadMermaid()
      .then((mermaid) => themed(mermaid).render(id, chart))
      .then(({ svg }) => {
        if (!cancelled && generation === latest.current) {
          setSvg(svg);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && generation === latest.current) {
          setSvg(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
      // mermaid leaves its measuring node behind when a render throws.
      document.getElementById(id)?.remove();
    };
  }, [chart, id]);

  if (error) {
    return (
      <Notice title="Diagram error">
        <pre className="font-mono text-xs whitespace-pre-wrap">{error}</pre>
      </Notice>
    );
  }

  if (!svg) return <div className="mb-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Rendering diagram…</div>;

  // mermaid's own output, generated under securityLevel: 'strict'.
  return <div className="mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}
