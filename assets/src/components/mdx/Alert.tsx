import type { ReactNode } from "react";

export type AlertType = "info" | "warning" | "error" | "success";

const ICONS: Record<AlertType, string> = {
  info: "ℹ️",
  warning: "⚠️",
  error: "❌",
  success: "✅",
};

export interface AlertProps {
  type?: AlertType;
  title?: string;
  children?: ReactNode;
}

export function Alert({ type = "info", title, children }: AlertProps) {
  // A document can name any string; fall back rather than render an unstyled box.
  const kind = type in ICONS ? type : "info";

  return (
    <div className={`mdx-alert mdx-alert--${kind}`} role="note">
      <div className="mdx-alert__header">
        <span aria-hidden="true">{ICONS[kind]}</span>
        <span className="mdx-alert__title">{title ?? kind}</span>
      </div>
      {children && <div className="mdx-alert__body">{children}</div>}
    </div>
  );
}
