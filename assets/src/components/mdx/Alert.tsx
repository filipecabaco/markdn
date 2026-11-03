import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, CircleX, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertType = "info" | "warning" | "error" | "success";

/** Each kind has its own outline, so the four differ in shape, not only colour. */
const ICONS: Record<AlertType, LucideIcon> = {
  info: Info,
  warning: CircleAlert,
  error: CircleX,
  success: CircleCheck,
};

const TONE: Record<AlertType, string> = {
  info: "text-foreground",
  success: "text-foreground",
  warning: "text-warning",
  error: "text-destructive",
};

export interface AlertProps {
  type?: AlertType;
  title?: string;
  children?: ReactNode;
}

/** shadcn's Alert: a bordered card, icon beside the title, body below. */
export function Alert({ type = "info", title, children }: AlertProps) {
  // A document can name any string; fall back rather than render an unstyled box.
  const kind = type in ICONS ? type : "info";
  const Icon = ICONS[kind];

  return (
    <div
      className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground"
      role="note"
    >
      <Icon aria-hidden="true" className={cn("mdx-alert__icon mt-0.5 size-4", TONE[kind])} />
      <div className={cn("font-medium first-letter:uppercase", kind === "error" && "text-destructive")}>
        {title ?? kind}
      </div>
      {children && <div className="mdx-body col-start-2 text-muted-foreground">{children}</div>}
    </div>
  );
}
