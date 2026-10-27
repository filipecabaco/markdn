import { useEffect, useId, useRef, useState } from "react";

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
 * The diagram drawn on the document card: its surface, its ink and its rules,
 * read at render time so it follows the theme setting as well as the OS one.
 * mermaid bakes its palette in at initialize, so this runs before every render.
 */
function themeFromTokens() {
  const surface = tokenHex("--surface");
  const panel = tokenHex("--panel");
  const ink = tokenHex("--ink");
  const muted = tokenHex("--ink-muted");
  const rule = tokenHex("--line-control");
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
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--font-ui").trim() || undefined,
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
      <div className="mdx-warning" role="note">
        <strong>Diagram error</strong>
        <pre>{error}</pre>
      </div>
    );
  }

  if (!svg) return <div className="mermaid-pending">Rendering diagram…</div>;

  // mermaid's own output, generated under securityLevel: 'strict'.
  return <div className="mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}
