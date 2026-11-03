import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

/**
 * A question the app cannot answer for the user, asked in the status strip.
 *
 * Not a modal: the document stays readable while the choice is open, which is
 * the thing being decided about. And not `window.confirm`, which the desktop
 * webview does not reliably show. Focus goes to the first action so the
 * keyboard can answer at once; Escape takes the last, which is always the
 * one that changes nothing.
 */

export interface Decision {
  message: string;
  /** In order of preference. The last must be the do-nothing choice. */
  actions: { label: string; run: () => void }[];
}

interface Props {
  decision: Decision;
  onDone: () => void;
}

export function DecisionBar({ decision, onDone }: Props) {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bar.current?.querySelector("button")?.focus();
  }, [decision]);

  const choose = (run: () => void) => {
    onDone();
    run();
  };

  const cancel = decision.actions[decision.actions.length - 1];

  return (
    <div
      ref={bar}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/60 px-3 py-2 text-sm"
      role="alertdialog"
      aria-label={decision.message}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !cancel) return;
        event.preventDefault();
        event.stopPropagation();
        choose(cancel.run);
      }}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
      <span className="min-w-0 flex-1">{decision.message}</span>
      <span className="flex flex-wrap gap-1.5">
        {decision.actions.map((action, index) => (
          <Button
            key={action.label}
            type="button"
            size="sm"
            variant={index === 0 ? "default" : "outline"}
            onClick={() => choose(action.run)}
          >
            {action.label}
          </Button>
        ))}
      </span>
    </div>
  );
}
