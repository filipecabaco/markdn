import { startTransition, useEffect, useRef, useState, type RefObject } from "react";

/** A render that fits in a frame and a half stays live on every keystroke. */
const LIVE_BUDGET_MS = 24;
const MIN_DELAY_MS = 80;
const MAX_DELAY_MS = 400;

/**
 * `value`, delivered as fast as the thing rendering it can keep up.
 *
 * The preview re-parses the whole document to render it. For a note that takes
 * a few milliseconds and the preview follows every keystroke, as it always has.
 * For a 4,000-line document it took 130ms — on every key, before the key itself
 * could paint. So `cost` (the last render's duration, measured by the consumer)
 * decides: within budget the value passes straight through; over it, the value
 * is held until typing pauses for about twice the render time, then delivered
 * as a transition. The keystroke paints at the editor's speed; the preview
 * catches up a beat later.
 *
 * A change of `resetKey` — another document opened — always shows at once:
 * pacing is for typing, not for swapping what is on screen.
 */
export function usePacedValue<T>(value: T, resetKey: unknown, cost: RefObject<number>): T {
  const [paced, setPaced] = useState(value);
  const key = useRef(resetKey);
  const swapped = key.current !== resetKey;
  const live = swapped || cost.current < LIVE_BUDGET_MS;

  useEffect(() => {
    key.current = resetKey;

    if (live) {
      setPaced(value);
      return;
    }

    const delay = Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, cost.current * 2));
    const timer = window.setTimeout(() => startTransition(() => setPaced(value)), delay);
    return () => window.clearTimeout(timer);
  }, [cost, live, resetKey, value]);

  return live ? value : paced;
}
