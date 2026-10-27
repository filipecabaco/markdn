import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PathField, documentName } from "./PathField";

describe("documentName", () => {
  it("adds .md to a bare name", () => {
    expect(documentName("ideas")).toBe("ideas.md");
    expect(documentName("notes/ideas")).toBe("notes/ideas.md");
  });

  it("keeps a markdown extension the user typed, in any case", () => {
    expect(documentName("a.md")).toBe("a.md");
    expect(documentName("a.mdx")).toBe("a.mdx");
    expect(documentName("README.MD")).toBe("README.MD");
    expect(documentName("a.markdown")).toBe("a.markdown");
  });

  it("treats a non-markdown extension as part of the name", () => {
    expect(documentName("v1.2")).toBe("v1.2.md");
  });

  it("trims, and refuses a blank name or a directory", () => {
    expect(documentName("  spaced  ")).toBe("spaced.md");
    expect(documentName("   ")).toBeNull();
    expect(documentName("notes/")).toBeNull();
  });
});

describe("PathField", () => {
  it("creates the document named, with the extension filled in", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<PathField verb="create" label="New document path" initial="notes/" onSubmit={onCreate} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText("New document path"), "plan{Enter}");

    expect(onCreate).toHaveBeenCalledWith("notes/plan.md");
  });

  it("shows why creating failed and keeps the name", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValue(new Error("a file already exists at that path"));
    render(<PathField verb="create" label="New document path" initial="" onSubmit={onCreate} onCancel={vi.fn()} />);

    const field = screen.getByLabelText("New document path");
    await user.type(field, "taken{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
    expect(field).toHaveValue("taken");
    expect(field).not.toBeDisabled();
    // Still focused, so the name can be fixed or the field escaped at once.
    expect(field).toHaveFocus();
  });

  it("refuses an empty name without calling the server", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<PathField verb="create" label="New document path" initial="" onSubmit={onCreate} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText("New document path"), "{Enter}");

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("cancels on escape", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<PathField verb="create" label="New document path" initial="" onSubmit={vi.fn()} onCancel={onCancel} />);

    await user.type(screen.getByLabelText("New document path"), "draft{Escape}");

    expect(onCancel).toHaveBeenCalled();
  });

  it("selects only the name when renaming, so typing replaces it", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <PathField
        verb="rename"
        label="Rename"
        initial="notes/old.md"
        selectName
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.keyboard("fresh{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("notes/fresh.md");
  });
});
