import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MultiBuffer } from "./MultiBuffer";
import { searchContents } from "../api";

vi.mock("../api", () => ({ searchContents: vi.fn() }));

const CONTENTS = [
  "# Notes",
  "",
  "before one",
  "the needle line",
  "after one",
  "",
  "far away",
  "far away",
  "far away",
  "",
  "the second needle",
  "end",
].join("\n");

function setup() {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onOpen = vi.fn();
  const onClose = vi.fn();

  vi.mocked(searchContents).mockResolvedValue({
    query: "needle",
    truncated: false,
    files: [{ path: "notes/a.md", name: "a.md", contents: CONTENTS }],
  });

  render(<MultiBuffer onSave={onSave} onOpen={onOpen} onClose={onClose} />);
  return { onSave, onOpen, onClose };
}

async function search(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Search all documents"), "needle{Enter}");
  await screen.findByText("notes/a.md");
}

describe("MultiBuffer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows one excerpt per match, with its context", async () => {
    const user = userEvent.setup();
    setup();
    await search(user);

    const [first, second] = screen.getAllByRole("textbox", { name: /^Excerpt at line/ });
    expect(first).toHaveValue("\nbefore one\nthe needle line\nafter one\n");
    expect(second).toHaveValue("far away\n\nthe second needle\nend");
    expect(screen.getByText(/2 matches in 1 file/)).toBeInTheDocument();
  });

  it("numbers excerpts by their real position in the file", async () => {
    const user = userEvent.setup();
    setup();
    await search(user);

    // The second excerpt starts at line 9, counted through the six lines above
    // it that it does not show — the number is the file's, not the pane's.
    expect(screen.getByLabelText("Excerpt at line 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Excerpt at line 9")).toBeInTheDocument();
  });

  it("writes back the whole document, including the lines it never showed", async () => {
    const user = userEvent.setup();
    const { onSave } = setup();
    await search(user);

    const excerpt = screen.getByLabelText("Excerpt at line 2");
    await user.clear(excerpt);
    await user.type(excerpt, "replaced");
    await user.click(screen.getByRole("button", { name: /Save all/ }));

    expect(onSave).toHaveBeenCalledWith("notes/a.md", expect.stringContaining("replaced"));
    // The heading and the untouched tail are outside every excerpt. Losing them
    // is the failure this feature cannot have.
    const [, written] = onSave.mock.calls[0];
    expect(written).toContain("# Notes");
    expect(written).toContain("the second needle");
    expect(written).not.toContain("the needle line");
  });

  it("replaces every match across the results", async () => {
    const user = userEvent.setup();
    setup();
    await search(user);

    await user.type(screen.getByLabelText("Replacement text"), "pin");
    await user.click(screen.getByRole("button", { name: "Replace all" }));

    expect(screen.getByLabelText("Excerpt at line 2")).toHaveValue(
      "\nbefore one\nthe pin line\nafter one\n",
    );
    expect(screen.getByText(/1 file edited/)).toBeInTheDocument();
  });

  it("refuses to run a second search over unsaved edits", async () => {
    const user = userEvent.setup();
    setup();
    await search(user);

    await user.type(screen.getByLabelText("Excerpt at line 2"), "x");

    expect(screen.getByRole("button", { name: /Search/ })).toBeDisabled();
    expect(screen.getByText(/1 file edited, not saved/)).toBeInTheDocument();
  });

  it("asks before closing over unsaved edits", async () => {
    const user = userEvent.setup();
    const { onClose } = setup();
    await search(user);

    await user.type(screen.getByLabelText("Excerpt at line 2"), "x");
    await user.click(screen.getByRole("button", { name: /^Close/ }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/Close and lose edits/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("reports a failed save and keeps the file dirty", async () => {
    const user = userEvent.setup();
    const { onSave } = setup();
    onSave.mockRejectedValue(new Error("notes/a.md is open with unsaved changes"));
    await search(user);

    await user.type(screen.getByLabelText("Excerpt at line 2"), "x");
    await user.click(screen.getByRole("button", { name: /Save all/ }));

    expect(await screen.findByText(/is open with unsaved changes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Search/ })).toBeDisabled();
  });
});
