import { memo } from "react";
import type { Heading } from "../lines";
import { cn } from "@/lib/utils";

/**
 * The open document's headings, indented by level. The section in view is
 * highlighted; a section an agent changed carries a dot until it is visited.
 */

interface Props {
  title: string;
  headings: Heading[];
  current: number | null;
  alerts: Set<number>;
  onJump: (line: number) => void;
}

const INDENT: Record<number, string> = { 1: "pl-2", 2: "pl-5", 3: "pl-8" };

export const Outline = memo(function Outline({ title, headings, current, alerts, onJump }: Props) {
  if (headings.length === 0) {
    return (
      <nav aria-label="Document outline">
        <p className="px-2 py-1 text-xs text-muted-foreground">No headings in {title}.</p>
      </nav>
    );
  }

  return (
    <nav aria-label="Document outline">
      <ol className="flex flex-col gap-px">
        {headings.map((heading) => {
          const here = heading.line === current;
          const alert = alerts.has(heading.line);
          return (
            <li key={heading.line}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md py-1 pr-2 text-left text-[0.8125rem] text-sidebar-foreground/80 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  INDENT[heading.depth] ?? "pl-8",
                  heading.depth === 1 && "font-medium text-sidebar-foreground",
                  here && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                )}
                aria-current={here ? "location" : undefined}
                onClick={() => onJump(heading.line)}
              >
                <span className="min-w-0 flex-1 truncate">{heading.text}</span>
                {alert && (
                  <span className="size-1.5 shrink-0 rounded-full bg-warning">
                    <span className="sr-only">changed by an agent</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
});
