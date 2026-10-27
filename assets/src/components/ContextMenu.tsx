import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

/**
 * A right-click menu drawn by the app.
 *
 * Without one the webview shows its own, which on the file tree offers little
 * more than Reload — and Reload throws away unsaved edits. Opened at the pointer,
 * nudged back inside the window, and closed by Escape, a click elsewhere, a
 * scroll, or the window losing focus, the way a native menu would be.
 */

export type MenuItem =
  | {
      label: string;
      run: () => void;
      hint?: string;
      danger?: boolean;
      disabled?: boolean;
    }
  | "separator";

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  /** Read out by screen readers as the menu's name, e.g. the file it is for. */
  label: string;
  onClose: () => void;
}

const EDGE = 8;

export function ContextMenu({ x, y, items, label, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  // Whatever had focus when the menu opened — a tree item, when it was opened
  // from the keyboard — gets it back on close, unless the chosen action already
  // put focus somewhere (the rename field, say).
  const [previous] = useState(() => document.activeElement as HTMLElement | null);

  useEffect(
    () => () => {
      const active = document.activeElement;
      if (previous?.isConnected && (!active || active === document.body)) previous.focus();
    },
    [previous],
  );

  // Measured before paint, so a menu opened near an edge never flashes outside it.
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setPosition({
      left: Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE)),
      top: Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE)),
    });
  }, [x, y]);

  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();

    const outside = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };

    // Capture phase, so a click that lands on another control closes this first.
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("scroll", onClose, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);

    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("scroll", onClose, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const onKeyDown = (event: KeyboardEvent) => {
    const buttons = [
      ...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "Tab") {
      // A menu is not a tab stop sequence; leaving it is closing it.
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      ref={menu}
      className="menu"
      role="menu"
      aria-label={label}
      style={{ left: position.left, top: position.top }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) =>
        item === "separator" ? (
          // eslint-disable-next-line react/no-array-index-key -- separators are positional
          <div key={`separator-${index}`} className="menu__separator" role="separator" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={`menu__item${item.danger ? " is-danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.run();
            }}
          >
            <span>{item.label}</span>
            {item.hint && <kbd className="menu__hint">{item.hint}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
