import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

/**
 * Something about the document the reader should know, drawn in the preview: an
 * MDX parse failure, a diagram that did not draw, an unknown component.
 */
export function Notice({
  title,
  children,
  ...position
}: {
  title?: string;
  children?: ReactNode;
  "data-line"?: string;
  "data-block"?: string;
}) {
  return (
    <div
      className="mb-4 grid max-w-[70ch] grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded-lg border border-dashed px-3 py-2 text-sm"
      role="note"
      {...position}
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 text-warning" />
      {title && <strong className="font-medium">{title}</strong>}
      {children && (
        <div className={title ? "col-start-2 text-muted-foreground" : "text-muted-foreground"}>
          {children}
        </div>
      )}
    </div>
  );
}
