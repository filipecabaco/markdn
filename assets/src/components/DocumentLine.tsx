import { memo } from "react";
import type { Heading, LineInk } from "../lines";

/**
 * The open document drawn as a line: its headings are stations, the section in
 * view is the lit interchange, and a section an agent changed carries a service
 * alert until it is visited. Stations are evenly spaced, as on a transit
 * diagram — order, not distance, is what a reader navigates by — and each one
 * is a 44pt target, so the line is the way to move through a long document on
 * glass.
 */

interface Props {
  title: string;
  headings: Heading[];
  ink: LineInk;
  current: number | null;
  alerts: Set<number>;
  onJump: (line: number) => void;
}

export const DocumentLine = memo(function DocumentLine({
  title,
  headings,
  ink,
  current,
  alerts,
  onJump,
}: Props) {
  if (headings.length === 0) {
    return (
      <nav className="doc-line doc-line--empty" aria-label="Document outline">
        <p className="doc-line__empty">No headings in {title}.</p>
      </nav>
    );
  }

  return (
    <nav className="doc-line" aria-label="Document outline" data-ink={ink}>
      <ol className="doc-line__stops">
        {headings.map((heading) => {
          const here = heading.line === current;
          const alert = alerts.has(heading.line);
          return (
            <li key={heading.line} className={`doc-line__stop doc-line__stop--h${heading.depth}`}>
              <button
                type="button"
                className={`doc-line__station${here ? " is-here" : ""}${alert ? " has-alert" : ""}`}
                aria-current={here ? "location" : undefined}
                onClick={() => onJump(heading.line)}
              >
                <span className="doc-line__marker" aria-hidden="true" />
                <span className="doc-line__name">{heading.text}</span>
                {alert && (
                  <span className="doc-line__alert">
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M8 2.2 14.6 13.6H1.4Z" />
                      <path className="doc-line__alert-mark" d="M8 6.4v3.4M8 11.6v.01" />
                    </svg>
                    <span className="visually-hidden">changed by an agent</span>
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
