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

  // Inside the desktop app the first search of a large tree takes seconds;
  // saying "nothing matches" before the server has answered is a false result.
  it("says it is searching until the server answers, not that nothing matched", async () => {
    let answer!: (value: Awaited<ReturnType<typeof searchDocuments>>) => void;
    vi.mocked(searchDocuments).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const user = userEvent.setup();
    render(<CommandPalette commands={[]} onOpenFile={vi.fn()} onClose={vi.fn()} />);

    await user.keyboard("presence");
    expect(await screen.findByText("Searching documents…")).toBeInTheDocument();
    expect(screen.queryByText("No documents or commands match.")).not.toBeInTheDocument();

    answer({
      query: "presence",
      results: [{ name: "presence.mdx", path: "guides/presence.mdx", score: 1, matches: [] }],
    });

    expect(await screen.findByRole("option", { name: /presence\.mdx/ })).toBeInTheDocument();
    expect(screen.queryByText("Searching documents…")).not.toBeInTheDocument();
  });

  it("says nothing matched once the server answers with nothing", async () => {
    vi.mocked(searchDocuments).mockResolvedValue({ query: "zzz", results: [] });
    const user = userEvent.setup();
    render(<CommandPalette commands={[]} onOpenFile={vi.fn()} onClose={vi.fn()} />);

    await user.keyboard("zzz");
    expect(await screen.findByText("No documents or commands match.")).toBeInTheDocument();
  });
});
