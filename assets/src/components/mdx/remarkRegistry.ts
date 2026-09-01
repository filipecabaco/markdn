import { visit } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Node } from "unist";

/**
 * Rewrites MDX JSX nodes into a single `<mdx-node>` hast element carrying the
 * component name and its props as JSON.
 *
 * Why one element rather than one tag per component: hast lowercases and
 * dash-cases property names on the way to React, so a `defaultValue` prop would
 * arrive as `defaultvalue`. Serialising the props into a single `data-` attribute
 * keeps them byte-for-byte intact, and `MdxNode` parses them back and dispatches
 * to the real component.
 *
 * Nothing here evaluates code. Attribute expressions are read with `JSON.parse`,
 * so `count={3}` and `items={["a"]}` work while `count={1 + 1}` does not — an
 * expression that is not JSON is dropped and reported rather than executed.
 */

interface MdxJsxAttribute {
  type: string;
  name?: string;
  value?: string | { value?: string } | null;
}

interface MdxJsxNode extends Node {
  name?: string | null;
  attributes?: MdxJsxAttribute[];
  data?: { hName?: string; hProperties?: Record<string, string> };
}

const JSX_NODE_TYPES = new Set(["mdxJsxFlowElement", "mdxJsxTextElement"]);

function readValue(value: MdxJsxAttribute["value"]): unknown {
  // `<Alert dismissible />` — a valueless attribute is boolean true.
  if (value === null || value === undefined) return true;
  // `<Alert type="warning" />` — a plain string literal.
  if (typeof value === "string") return value;

  // `<Table columns={["a","b"]} />` — an expression. Only JSON survives.
  const source = value.value;
  if (typeof source !== "string") return null;

  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

export const remarkComponentRegistry: Plugin = () => {
  return (tree: Node) => {
    visit(tree, (node: Node) => {
      if (!JSX_NODE_TYPES.has(node.type)) return;

      const jsx = node as MdxJsxNode;
      // A fragment (`<>`) has a null name and carries no component identity.
      if (!jsx.name) return;

      // JSX capitalisation rules: a lowercase name is an intrinsic HTML element
      // (`<kbd>`, `<sup>`), not a component. Routing those through the registry
      // would report every inline HTML tag as an unknown component, so they are
      // passed straight through to hast as themselves.
      if (!/^[A-Z]/.test(jsx.name)) {
        const attributes: Record<string, string> = {};

        for (const attribute of jsx.attributes ?? []) {
          if (attribute.type !== "mdxJsxAttribute" || !attribute.name) continue;
          const value = readValue(attribute.value);
          // Only primitives survive: hast properties are strings and booleans.
          if (typeof value === "string" || typeof value === "boolean") {
            attributes[attribute.name] = String(value);
          }
        }

        jsx.data = jsx.data ?? {};
        jsx.data.hName = jsx.name;
        jsx.data.hProperties = attributes;
        return;
      }

      const props: Record<string, unknown> = {};
      const dropped: string[] = [];

      for (const attribute of jsx.attributes ?? []) {
        // `{...spread}` cannot be resolved without evaluating code, so it is
        // reported rather than silently ignored.
        if (attribute.type !== "mdxJsxAttribute" || !attribute.name) {
          dropped.push("{...spread}");
          continue;
        }

        const value = readValue(attribute.value);
        if (value === null) dropped.push(attribute.name);
        else props[attribute.name] = value;
      }

      jsx.data = jsx.data ?? {};
      jsx.data.hName = "mdx-node";
      jsx.data.hProperties = {
        "data-mdx-name": jsx.name,
        "data-mdx-props": JSON.stringify(props),
        "data-mdx-dropped": dropped.join(","),
      };
    });
  };
};
