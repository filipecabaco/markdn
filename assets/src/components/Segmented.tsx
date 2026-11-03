import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A segmented control: one choice of a few, each a toggle button. Stock shadcn
 * has ToggleGroup for this; buttons with `aria-pressed` say the same thing to
 * assistive technology without a radio group's arrow-key contract, which the
 * app's own ⌘1–3 keys already cover.
 */

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  disabled?: boolean;
  title?: string;
  /** Trailing key hint, e.g. "1". */
  hint?: ReactNode;
}

interface Props<T extends string> {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function Segmented<T extends string>({ label, options, value, onChange, className }: Props<T>) {
  return (
    <div
      className={cn("inline-flex h-8 w-fit items-center gap-0.5 rounded-lg bg-muted p-0.5", className)}
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
              active && "bg-background text-foreground shadow-sm dark:bg-input/40",
            )}
            aria-pressed={active}
            disabled={option.disabled}
            title={option.title}
            onClick={() => onChange(option.id)}
          >
            {option.label}
            {option.hint}
          </button>
        );
      })}
    </div>
  );
}
