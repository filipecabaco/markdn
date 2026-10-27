import { useEffect, useState, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behaviour of a modal dialog, which `aria-modal` promises and the
 * browser does not supply: Tab and Shift+Tab cycle inside the dialog instead of
 * walking into the page behind the backdrop, and closing hands focus back to
 * whatever had it before — the editor, usually, mid-sentence.
 *
 * Initial focus is left to the dialog (an `autoFocus` field, a first option);
 * this only steps in if nothing inside took it.
 */
export function useModal(ref: RefObject<HTMLElement | null>) {
  // Read during the first render, not in the effect: React applies a child's
  // `autoFocus` while committing, before any effect runs, so by then the active
  // element is already the dialog's own field.
  const [previous] = useState(() => document.activeElement as HTMLElement | null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (!dialog.contains(document.activeElement)) {
      dialog.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      // Only real Tab stops: a palette's options are buttons, but tabindex -1
      // ones the browser skips, and counting them would put the end of the
      // cycle somewhere Tab never reaches.
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (item) => item.tabIndex >= 0,
      );
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const inside = dialog.contains(document.activeElement);

      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Only if it is still in the page: a dialog that opened a document may
      // have replaced the element that launched it.
      if (previous?.isConnected) previous.focus();
    };
  }, [ref, previous]);
}
