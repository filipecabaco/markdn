import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Teleprompter scrolling, and the keyboard scrolling that has to coexist with it.
 *
 * Smoothness comes from three things, all of which matter:
 *
 *   - one `requestAnimationFrame` loop, so movement lands on the compositor's
 *     clock rather than a timer's;
 *   - a fractional position kept in a ref, so a slow speed still advances every
 *     frame instead of stuttering forward a whole pixel every few frames;
 *   - delta time, so a dropped frame moves further rather than slowing down.
 *
 * Speed is in CSS pixels per second, and `+` / `-` step it geometrically: the
 * difference between 10 and 15 px/s matters as much as between 200 and 300, so
 * a linear step would feel coarse at the bottom and useless at the top.
 *
 * Three ways to interrupt, because they mean three different things:
 *
 *   - **Pause** (space) holds the session — speed, readout and keys all stay —
 *     for someone who wants to read a paragraph twice.
 *   - **Stop** (escape) ends it and gives the keys back.
 *   - **Arrows** are not an interruption at all. They scroll whenever they are
 *     pressed, in or out of a session, and a running session simply *holds*
 *     while they are in use and picks up again shortly after the last one. Two
 *     things scrolling one pane at once is the one outcome to avoid: the reader
 *     would be fighting the animation for the position of the page.
 *
 * Every one of those moves the same fractional position through the same loop,
 * so a nudge mid-scroll eases rather than jumps, and the animation never has to
 * be reconciled with a `scrollTop` somebody else wrote.
 */

export const MIN_SPEED = 5;
export const MAX_SPEED = 400;
const STEP = 1.25;

/** After a hidden tab or a long paint, `dt` must not teleport the document. */
const MAX_DELTA_SECONDS = 0.1;

/** Manual scrolling beyond this many pixels means the reader took over. */
const HANDOVER_PX = 2;

/** One arrow press, as a fraction of the visible pane — with a floor for short panes. */
const NUDGE_FRACTION = 0.12;
const NUDGE_MIN_PX = 40;

/** Time constant for easing a nudge out. Short enough to feel immediate. */
const NUDGE_TAU = 0.07;

/** Quiet time after the last arrow before auto-scroll takes the wheel back. */
const RESUME_AFTER_NUDGE_MS = 700;

interface Options {
  /** Resolved per frame: which pane is scrolling depends on the current view. */
  getScroller: () => HTMLElement | null;
  speed: number;
  onSpeedChange: (speed: number) => void;
}

export interface AutoScroll {
  /** A session is on, whether or not it is currently advancing. */
  active: boolean;
  paused: boolean;
  /** Held because the reader is working the arrow keys. Resolves on its own. */
  nudging: boolean;
  speed: number;
  /** Start, or pause and resume an already running session. */
  toggle: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  faster: () => void;
  slower: () => void;
}

const clamp = (speed: number) => Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed)));

/** True when the keystroke belongs to whatever the user is typing into. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useAutoScroll({ getScroller, speed, onSpeedChange }: Options): AutoScroll {
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [nudging, setNudging] = useState(false);

  const frame = useRef<number | null>(null);
  const position = useRef(0);
  const lastTime = useRef(0);
  /** Nudge distance still to be eased out, in pixels. Signed. */
  const pending = useRef(0);
  const lastNudge = useRef(Number.NEGATIVE_INFINITY);

  // The loop outlives every render it was started from, so everything it reads
  // per frame is a ref. Changing the speed or pausing then costs no restart —
  // and a restart is a dropped frame, visible exactly when the user is watching.
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const advancing = useRef(false);
  const nudgingRef = useRef(false);

  const stop = useCallback(() => {
    advancing.current = false;
    setActive(false);
    setPaused(false);
  }, []);

  const tick = useCallback(
    (time: number) => {
      const element = getScroller();
      if (!element) {
        frame.current = null;
        stop();
        return;
      }

      const delta = Math.min((time - lastTime.current) / 1000, MAX_DELTA_SECONDS);
      lastTime.current = time;

      // The reader scrolling by hand — a wheel, a trackpad, the scrollbar — wins:
      // adopt their position rather than snapping back to the animation's.
      if (Math.abs(element.scrollTop - position.current) > HANDOVER_PX) {
        position.current = element.scrollTop;
      }

      let move = 0;

      if (pending.current !== 0) {
        // Exponential ease: most of the nudge lands in the first few frames, and
        // holding the key down accumulates into one continuous glide.
        let step = pending.current * (1 - Math.exp(-delta / NUDGE_TAU));
        if (Math.abs(pending.current - step) < 0.5) step = pending.current;
        pending.current -= step;
        move += step;
      }

      const held = pending.current !== 0 || time - lastNudge.current < RESUME_AFTER_NUDGE_MS;
      if (advancing.current && !held) move += speedRef.current * delta;

      const limit = Math.max(element.scrollHeight - element.clientHeight, 0);
      position.current = Math.min(Math.max(position.current + move, 0), limit);
      element.scrollTop = position.current;

      const showHeld = held && advancing.current;
      if (showHeld !== nudgingRef.current) {
        nudgingRef.current = showHeld;
        setNudging(showHeld);
      }

      // Reaching the end ends the session; there is nothing left to scroll and a
      // readout that claims to be scrolling would be lying.
      if (advancing.current && !held && position.current >= limit - 0.5) {
        frame.current = null;
        stop();
        return;
      }

      // Idle out when neither a session nor a nudge needs the next frame.
      if (!advancing.current && pending.current === 0) {
        frame.current = null;
        if (nudgingRef.current) {
          nudgingRef.current = false;
          setNudging(false);
        }
        return;
      }

      frame.current = requestAnimationFrame(tick);
    },
    [getScroller, stop],
  );

  /** Starts the frame loop if it is not already running. Safe to call often. */
  const ensureLoop = useCallback(() => {
    if (frame.current !== null) return;

    const element = getScroller();
    if (!element) return;

    position.current = element.scrollTop;
    lastTime.current = performance.now();
    frame.current = requestAnimationFrame(tick);
  }, [getScroller, tick]);

  const start = useCallback(() => {
    if (!getScroller()) return;

    // Reading, not typing: a focused textarea would otherwise swallow the space
    // bar and the arrows, and fight the scroll with its own caret movement.
    const focused = document.activeElement;
    if (focused instanceof HTMLTextAreaElement || focused instanceof HTMLInputElement) {
      focused.blur();
    }

    advancing.current = true;
    setActive(true);
    setPaused(false);
    ensureLoop();
  }, [ensureLoop, getScroller]);

  const pause = useCallback(() => {
    advancing.current = false;
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    advancing.current = true;
    setPaused(false);
    ensureLoop();
  }, [ensureLoop]);

  const toggle = useCallback(() => {
    if (!active) start();
    else if (paused) resume();
    else pause();
  }, [active, pause, paused, resume, start]);

  /** Scrolls by one step and holds the session while the reader keeps going. */
  const nudge = useCallback(
    (direction: 1 | -1) => {
      const element = getScroller();
      if (!element) return;

      const step = Math.max(element.clientHeight * NUDGE_FRACTION, NUDGE_MIN_PX);
      pending.current += direction * step;
      lastNudge.current = performance.now();
      ensureLoop();
    },
    [ensureLoop, getScroller],
  );

  const faster = useCallback(() => onSpeedChange(clamp(speed * STEP)), [onSpeedChange, speed]);
  const slower = useCallback(() => onSpeedChange(clamp(speed / STEP)), [onSpeedChange, speed]);

  useEffect(() => {
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      advancing.current = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Cmd/Ctrl+Space starts, then pauses and resumes. On macOS the system
      // usually claims Cmd+Space for Spotlight before the app sees it, which is
      // why the palette and the reading HUD both carry these too.
      if ((event.metaKey || event.ctrlKey) && event.code === "Space") {
        event.preventDefault();
        toggle();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;
      // A dialog owns its own arrow keys — the palette moves a selection with
      // them — and nothing behind it should scroll underneath.
      if (document.querySelector("[role='dialog']")) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        nudge(event.key === "ArrowDown" ? 1 : -1);
        return;
      }

      if (!active) return;

      // Bare space is the teleprompter convention. Safe to claim only because a
      // running session has already taken focus out of the editor, and a reader
      // who clicks back into it gets the space bar back.
      if (event.code === "Space") {
        event.preventDefault();
        if (paused) resume();
        else pause();
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        faster();
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        slower();
      } else if (event.key === "Escape") {
        event.preventDefault();
        stop();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, faster, nudge, pause, paused, resume, slower, stop, toggle]);

  return { active, paused, nudging, speed, toggle, pause, resume, stop, faster, slower };
}
