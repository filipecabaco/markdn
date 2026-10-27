import type { ReactNode } from "react";

export type AlertType = "info" | "warning" | "error" | "success";

/**
 * Drawn glyphs on a 12px grid, one 1.25px stroke, square ends — the same
 * machined geometry as the mark. Emoji rendered as a different picture on every
 * platform and brought their own colours into a palette that has one accent.
 * Each kind has its own outline so the four differ in shape, not only in colour.
 */
const GLYPHS: Record<AlertType, ReactNode> = {
  info: (
    <>
      <rect x="1.5" y="1.5" width="9" height="9" />
      <path d="M6 5.25v3.5M6 3.25v.75" />
    </>
  ),
  warning: (
    <>
      <path d="M6 1.25 10.9 10H1.1Z" />
      <path d="M6 4.5v2.75M6 8.25V9" />
    </>
  ),
  error: (
    <>
      <path d="M4 1.25h4L10.75 4v4L8 10.75H4L1.25 8V4Z" />
      <path d="m4.25 4.25 3.5 3.5m0-3.5-3.5 3.5" />
    </>
  ),
  success: (
    <>
      <rect x="1.5" y="1.5" width="9" height="9" />
      <path d="m3.75 6.25 1.6 1.6 2.9-3.6" />
    </>
  ),
};

export interface AlertProps {
  type?: AlertType;
  title?: string;
  children?: ReactNode;
}

export function Alert({ type = "info", title, children }: AlertProps) {
  // A document can name any string; fall back rather than render an unstyled box.
  const kind = type in GLYPHS ? type : "info";

  return (
    <div className={`mdx-alert mdx-alert--${kind}`} role="note">
      <div className="mdx-alert__header">
        <svg
          className="mdx-alert__icon"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="square"
          aria-hidden="true"
        >
          {GLYPHS[kind]}
        </svg>
        <span className="mdx-alert__title">{title ?? kind}</span>
      </div>
      {children && <div className="mdx-alert__body">{children}</div>}
    </div>
  );
}
