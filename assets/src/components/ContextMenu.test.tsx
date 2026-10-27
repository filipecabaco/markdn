import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextMenu, type MenuItem } from "./ContextMenu";

function setup(items: MenuItem[]) {
  const onClose = vi.fn();
  render(<ContextMenu x={10} y={10} label="notes/a.md" items={items} onClose={onClose} />);
  return { onClose };
}

describe("ContextMenu", () => {
  it("runs the chosen item and closes", async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    const { onClose } = setup([{ label: "Open", run: open }]);

    await user.click(screen.getByRole("menuitem", { name: "Open" }));

    expect(open).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("focuses the first item and moves with the arrow keys, skipping disabled ones", async () => {
    const user = userEvent.setup();
    const rename = vi.fn();
    setup([
      { label: "Open", run: vi.fn() },
      "separator",
      { label: "Copy", run: vi.fn(), disabled: true },
      { label: "Rename…", run: rename },
    ]);

    expect(screen.getByRole("menuitem", { name: "Open" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Rename…" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Open" })).toHaveFocus();

    await user.keyboard("{ArrowUp}{Enter}");
    expect(rename).toHaveBeenCalled();
  });

  it("closes on escape and on a click outside it", async () => {
    const user = userEvent.setup();
    const { onClose } = setup([{ label: "Open", run: vi.fn() }]);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
