import { useEffect, useId, useRef, useState } from "react";

/**
 * Renders a mermaid diagram.
 *
 * mermaid is imported dynamically so its bulk never lands in the initial bundle
 * for documents that contain no diagrams.
 */

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        // 'strict' makes mermaid sanitise labels and refuse click handlers, which
        // matters because diagram source arrives from files this app did not write.
        securityLevel: "strict",
        // mermaid bakes its palette in at initialize time, so the theme is chosen
        // from the OS setting here rather than in CSS. "neutral" rather than the
        // default in light mode: the default paints lavender nodes, which fight a
        // warm-graphite surface whose only colour is the signal red.
        theme: window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "neutral",
      });
      return mermaid;
    });
  }
  return mermaidReady;
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
      .then((mermaid) => mermaid.render(id, chart))
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
