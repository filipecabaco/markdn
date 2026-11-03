import type { ReactNode } from "react";

export type CalloutType = "tip" | "note" | "important";

export interface CalloutProps {
  type?: CalloutType;
  title?: string;
  children?: ReactNode;
}

/** An aside: a quiet panel, set apart by its ground rather than a border. */
export function Callout({ type = "note", title, children }: CalloutProps) {
  return (
    <aside className="rounded-lg bg-muted px-4 py-3 text-sm" data-type={type}>
      {title && <div className="mb-1 font-medium">{title}</div>}
      <div className="mdx-body text-muted-foreground">{children}</div>
    </aside>
  );
}
