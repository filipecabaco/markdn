import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette } from "./CommandPalette";
import { searchDocuments } from "../api";

vi.mock("../api", () => ({ searchDocuments: vi.fn() }));

// jsdom lays nothing out, so it has no scrollIntoView for the active row.
Element.prototype.scrollIntoView ??= vi.fn();

describe("CommandPalette", () => {
  it("keeps focus in its field, so Tab cannot strand Escape", async () => {
    vi.mocked(searchDocuments).mockResolvedValue({ query: "", results: [] });
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <CommandPalette
        commands={[{ id: "a", title: "Save document", section: "Document", run: vi.fn() }]}
        commandsOnly
        onOpenFile={vi.fn()}
        onClose={onClose}
      />,
    );

    const field = screen.getByRole("combobox", { name: "Search documents or commands" });
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: /Save document/ }).id,
    );

    await user.tab();
    await user.tab();
    expect(field).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
