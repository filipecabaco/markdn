import type { ReactNode } from "react";
import { Notice } from "./Notice";
import { REGISTRY } from "./registry";

/**
 * Dispatches an `<mdx-node>` element produced by `remarkComponentRegistry` to the
 * registered component, or renders a visible placeholder when the document names
 * a component that does not exist.
 *
 * The placeholder is deliberate: silently dropping an unknown component makes a
 * document look fine while quietly losing content.
 */

interface MdxNodeProps {
  children?: ReactNode;
  "data-mdx-name"?: string;
  "data-mdx-props"?: string;
  "data-mdx-dropped"?: string;
  // Stamped by remarkSourcePositions. A component cannot receive DOM data
  // attributes, so they ride on a wrapper element instead — which is also the
  // element the sync rail measures.
  "data-line"?: string;
  "data-block"?: string;
}

export function MdxNode({ children, ...rest }: MdxNodeProps) {
  const name = rest["data-mdx-name"];
  const dropped = (rest["data-mdx-dropped"] ?? "").split(",").filter(Boolean);

  let props: Record<string, unknown> = {};
  try {
    props = JSON.parse(rest["data-mdx-props"] ?? "{}");
  } catch {
    props = {};
  }

  const position = {
    "data-line": rest["data-line"],
    "data-block": rest["data-block"],
  };

  if (!name) return <>{children}</>;

  const entry = REGISTRY[name];

  if (!entry) {
    return (
      <Notice title={`Unknown component <${name}>`} {...position}>
        Known components: {Object.keys(REGISTRY).join(", ")}
      </Notice>
    );
  }

  const Component = entry.component;

  return (
    <div className="mdx-block" {...position}>
      {dropped.length > 0 && (
        <Notice>
          Ignored non-JSON {dropped.length === 1 ? "prop" : "props"} on &lt;{name}&gt;:{" "}
          {dropped.join(", ")}
        </Notice>
      )}
      <Component {...props}>{children}</Component>
    </div>
  );
}
