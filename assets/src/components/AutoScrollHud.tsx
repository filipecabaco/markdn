import type { AutoScroll } from "../hooks/useAutoScroll";

/**
 * The readout for auto-scroll.
 *
 * Auto-scroll is otherwise invisible state with an invisible parameter: the page
 * moves and nothing says why, or how fast, or how to stop. It also carries the
 * controls, because macOS claims Cmd+Space for Spotlight before the app can see
 * it, so the shortcut cannot be the only way to work this.
 *
 * "Manual" is the state that most needs saying out loud: the reader pressed an
 * arrow, the session is deliberately holding, and it will pick up again by
 * itself in a moment. Without the label that reads as auto-scroll having broken.
 */

interface Props {
  autoScroll: AutoScroll;
}

export function AutoScrollHud({ autoScroll }: Props) {
  if (!autoScroll.active) return null;

  const { paused, nudging, pause, resume } = autoScroll;

  // Three states, one line: held by the reader's arrow keys reads differently
  // from held by the pause button, and both differ from running.
  const state = paused ? "is-paused" : nudging ? "is-nudging" : "";
  const label = paused ? "Paused" : nudging ? "Manual" : "Auto-scroll";

  return (
    <div className={`autoscroll ${state}`.trim()} role="status" aria-live="off">
      <span className="autoscroll__pulse" aria-hidden="true" />
      <span className="autoscroll__label">{label}</span>

      <button
        type="button"
        className="autoscroll__step"
        onClick={autoScroll.slower}
        aria-label="Slower"
        title="Slower (−)"
      >
        −
      </button>
      <span className="autoscroll__speed">{autoScroll.speed} px/s</span>
      <button
        type="button"
        className="autoscroll__step"
        onClick={autoScroll.faster}
        aria-label="Faster"
        title="Faster (+)"
      >
        +
      </button>

      <button
        type="button"
        className="autoscroll__control"
        onClick={paused ? resume : pause}
        title={`${paused ? "Resume" : "Pause"} (space)`}
      >
        {paused ? "Resume" : "Pause"}
        <kbd>space</kbd>
      </button>

      <button type="button" className="autoscroll__control" onClick={autoScroll.stop}>
        Stop
        <kbd>esc</kbd>
      </button>
    </div>
  );
}
