import { useEffect, useRef } from "react";
import { useModal } from "../hooks/useModal";
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
  useModal(ref);

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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh] dark:bg-black/50" onMouseDown={onClose}>
      <div
        ref={ref}
        className="flex w-full max-w-md flex-col gap-0.5 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Insert component"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="px-2 pt-1 pb-2 text-sm font-medium">Insert component</h2>
        {Object.entries(REGISTRY).map(([name, entry]) => (
          <button
            key={name}
            type="button"
            className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent"
            onClick={() => onInsert(SNIPPETS[name] ?? `<${name} />`)}
          >
            <span className="font-mono text-sm">&lt;{name}&gt;</span>
            <span className="text-xs text-muted-foreground">{entry.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
