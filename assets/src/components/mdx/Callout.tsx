import type { ReactNode } from "react";

export type CalloutType = "tip" | "note" | "important";

export interface CalloutProps {
  type?: CalloutType;
  title?: string;
  children?: ReactNode;
}

export function Callout({ type = "note", title, children }: CalloutProps) {
  return (
    <aside className={`mdx-callout mdx-callout--${type}`}>
      {title && <div className="mdx-callout__title">{title}</div>}
      <div className="mdx-callout__body">{children}</div>
    </aside>
  );
}
