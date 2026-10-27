import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "./Editor";

function setup(value = "text") {
  const onChange = vi.fn();
  render(
    <>
      <button type="button">before</button>
      <Editor
        value={value}
        onChange={onChange}
        textareaRef={createRef<HTMLTextAreaElement>()}
        picking={false}
        onPickingChange={vi.fn()}
      />
      <button type="button">after</button>
    </>,
  );
  return { onChange, field: screen.getByRole("textbox", { name: "Markdown source" }) };
}

describe("Editor", () => {
  it("indents on Tab", async () => {
    const user = userEvent.setup();
    const { onChange, field } = setup();

    await user.click(field);
    await user.keyboard("{Tab}");

    expect(onChange).toHaveBeenCalledWith(expect.stringContaining("  "));
    expect(field).toHaveFocus();
  });

  it("never traps focus: Shift+Tab leaves backwards, Escape then Tab forwards", async () => {
    const user = userEvent.setup();
    const { field } = setup();

    await user.click(field);
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: "before" })).toHaveFocus();

    await user.click(field);
    await user.keyboard("{Escape}{Tab}");
    expect(screen.getByRole("button", { name: "after" })).toHaveFocus();
  });

  it("toggles Tab-moves-focus on Ctrl+Shift+M, as in VS Code", async () => {
    const user = userEvent.setup();
    const { onChange, field } = setup();

    await user.click(field);
    await user.keyboard("{Control>}{Shift>}m{/Shift}{/Control}");
    expect(screen.getByRole("status")).toHaveTextContent("Tab moves focus");

    await user.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "after" })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("says how to leave, for screen readers", () => {
    const { field } = setup();
    expect(field).toHaveAccessibleDescription(/Escape then Tab/);
  });
});
