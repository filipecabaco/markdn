import { useEffect, useRef } from "react";

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
      className="banner banner--decision"
      role="alertdialog"
      aria-label={decision.message}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !cancel) return;
        event.preventDefault();
        event.stopPropagation();
        choose(cancel.run);
      }}
    >
      <span className="banner__dot" />
      <span className="banner__message">{decision.message}</span>
      <span className="banner__actions">
        {decision.actions.map((action, index) => (
          <button
            key={action.label}
            type="button"
            className={`button${index === 0 ? "" : " button--quiet"}`}
            onClick={() => choose(action.run)}
          >
            {action.label}
          </button>
        ))}
      </span>
    </div>
  );
}
