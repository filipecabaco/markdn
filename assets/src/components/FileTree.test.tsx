import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileTree } from "./FileTree";
import { listDocuments } from "../api";

vi.mock("../api", () => ({ listDocuments: vi.fn() }));

const LISTINGS: Record<string, { name: string; path: string; type: "file" | "directory" }[]> = {
  ".": [
    { name: "notes", path: "notes", type: "directory" },
    { name: "a.md", path: "a.md", type: "file" },
  ],
  notes: [{ name: "inner.md", path: "notes/inner.md", type: "file" }],
};

function setup() {
  const onSelect = vi.fn();
  const onEntryMenu = vi.fn();
  render(<FileTree path="." selected="a.md" onSelect={onSelect} onEntryMenu={onEntryMenu} />);
  return { onSelect, onEntryMenu };
}

const item = (name: string) => screen.getByRole("treeitem", { name: new RegExp(`^${name}`) });

describe("FileTree", () => {
  beforeEach(() => {
    vi.mocked(listDocuments).mockImplementation((path = ".") =>
      Promise.resolve({ entries: LISTINGS[path] ?? [] }),
    );
  });

  it("is one tab stop, with the open document marked selected", async () => {
    setup();
    await screen.findByRole("tree", { name: "Documents" });

    expect(item("notes")).toHaveAttribute("tabindex", "0");
    expect(item("a.md")).toHaveAttribute("tabindex", "-1");
    expect(item("a.md")).toHaveAttribute("aria-selected", "true");
    expect(item("notes")).toHaveAttribute("aria-expanded", "false");
  });

  it("walks, opens and closes folders from the keyboard", async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    await screen.findByRole("tree");

    await user.tab();
    expect(item("notes")).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("treeitem", { name: "inner.md" })).toBeInTheDocument();
    expect(item("notes")).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{ArrowRight}");
    expect(item("inner.md")).toHaveFocus();
    expect(item("inner.md")).toHaveAttribute("tabindex", "0");

    await user.keyboard("{ArrowLeft}");
    expect(item("notes")).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(item("notes")).toHaveAttribute("aria-expanded", "false");

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith("a.md");
  });

  it("opens the context menu from the keyboard", async () => {
    const user = userEvent.setup();
    const { onEntryMenu } = setup();
    await screen.findByRole("tree");

    await user.tab();
    await user.keyboard("{ArrowDown}{Shift>}{F10}{/Shift}");

    expect(onEntryMenu).toHaveBeenCalledWith(
      { name: "a.md", path: "a.md", type: "file" },
      expect.any(Number),
      expect.any(Number),
    );
  });
});

describe("FileTree explorer keys", () => {
  beforeEach(() => {
    vi.mocked(listDocuments).mockImplementation((path = ".") =>
      Promise.resolve({ entries: LISTINGS[path] ?? [] }),
    );
  });

  it("maps VS Code's F2, Cmd+Backspace and copy-path keys to commands", async () => {
    const user = userEvent.setup();
    const onEntryCommand = vi.fn();
    render(<FileTree path="." selected={null} onSelect={vi.fn()} onEntryCommand={onEntryCommand} />);
    await screen.findByRole("tree");
    await user.tab();
    await user.keyboard("{ArrowDown}");

    const file = { name: "a.md", path: "a.md", type: "file" };
    await user.keyboard("{F2}");
    expect(onEntryCommand).toHaveBeenLastCalledWith(file, "rename");
    await user.keyboard("{Meta>}{Backspace}{/Meta}");
    expect(onEntryCommand).toHaveBeenLastCalledWith(file, "trash");
    await user.keyboard("{Meta>}{Alt>}c{/Alt}{/Meta}");
    expect(onEntryCommand).toHaveBeenLastCalledWith(file, "copyPath");
    await user.keyboard("{Meta>}{Alt>}{Shift>}c{/Shift}{/Alt}{/Meta}");
    expect(onEntryCommand).toHaveBeenLastCalledWith(file, "copyRelativePath");
  });

  it("does not rename or trash a folder", async () => {
    const user = userEvent.setup();
    const onEntryCommand = vi.fn();
    render(<FileTree path="." selected={null} onSelect={vi.fn()} onEntryCommand={onEntryCommand} />);
    await screen.findByRole("tree");
    await user.tab();

    await user.keyboard("{F2}{Meta>}{Backspace}{/Meta}");

    expect(onEntryCommand).not.toHaveBeenCalled();
  });

  it("steps a nested document in by its depth", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole("tree");

    await user.click(screen.getByText("notes"));

    expect(await screen.findByRole("treeitem", { name: /^inner\.md/ })).toHaveStyle("--depth: 1");
    expect(item("a.md")).toHaveStyle("--depth: 0");
  });

  it("says in words why a folder could not be opened, on its line", async () => {
    vi.mocked(listDocuments).mockImplementation((path = ".") =>
      path === "notes"
        ? Promise.reject(new Error("permission denied"))
        : Promise.resolve({ entries: LISTINGS[path] ?? [] }),
    );
    const user = userEvent.setup();
    setup();
    await screen.findByRole("tree");

    await user.click(screen.getByText("notes"));

    const message = await screen.findByText("MarkDN isn't allowed to read this folder.");
    expect(message.closest("li")).toHaveAttribute("data-terminus");
    expect(screen.queryByText(/eperm|permission denied/)).not.toBeInTheDocument();
  });
});
