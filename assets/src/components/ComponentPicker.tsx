import { useEffect, useRef } from "react";
import { REGISTRY } from "./mdx/registry";

/**
 * Menu for inserting a registered MDX component at the cursor.
 *
 * Opened with Cmd/Ctrl+Shift+C. Inserting from a list rather than typing JSX by
 * hand is the point: the registry is the allowlist, so anything offered here is
 * guaranteed to render.
 */

const SNIPPETS: Record<string, string> = {
  Alert: '<Alert type="warning" title="Heads up">\n  Something worth noticing.\n</Alert>',
  Callout: '<Callout type="tip" title="Pro tip">\n  You can use **markdown** in here.\n</Callout>',
  Card: '<Card title="Title" subtitle="Subtitle">\n  Card body.\n</Card>',
  Tabs:
    '<Tabs defaultValue="first">\n  <Tab value="first" label="First">\n    First panel.\n  </Tab>\n  <Tab value="second" label="Second">\n    Second panel.\n  </Tab>\n</Tabs>',
  Tab: '<Tab value="value" label="Label">\n  Panel content.\n</Tab>',
};

interface Props {
  onInsert: (snippet: string) => void;
  onClose: () => void;
}

export function ComponentPicker({ onInsert, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus the first option so the menu is usable from the keyboard alone.
    ref.current?.querySelector("button")?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="picker__backdrop" onMouseDown={onClose}>
      <div
        ref={ref}
        className="picker"
        role="dialog"
        aria-label="Insert component"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="picker__title">Insert component</h2>
        {Object.entries(REGISTRY).map(([name, entry]) => (
          <button
            key={name}
            type="button"
            className="picker__option"
            onClick={() => onInsert(SNIPPETS[name] ?? `<${name} />`)}
          >
            <span className="picker__name">{name}</span>
            <span className="picker__description">{entry.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
