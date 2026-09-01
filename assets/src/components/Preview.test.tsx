import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Preview } from "./Preview";

/**
 * End-to-end through the real Preview pipeline: markdown in, DOM out. These are
 * the assertions that would have caught the `<kbd>` regression before a browser
 * did.
 */
describe("Preview", () => {
  it("renders a registered component", () => {
    render(<Preview content={'<Alert type="warning" title="Heads up">Body</Alert>'} />);
    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("shows a placeholder for an unregistered component", () => {
    // Silently dropping it would make a document look fine while losing content.
    render(<Preview content={"<Accordion title=\"x\" />"} />);
    expect(screen.getByText(/Unknown component/)).toBeInTheDocument();
    expect(screen.getByText(/Alert, Callout, Card, Tabs, Tab/)).toBeInTheDocument();
  });

  it("renders inline HTML tags as HTML, not as unknown components", () => {
    render(<Preview content={"Press <kbd>Cmd</kbd>."} />);
    expect(screen.getByText("Cmd").tagName).toBe("KBD");
    expect(screen.queryByText(/Unknown component/)).not.toBeInTheDocument();
  });

  it("renders GFM tables", () => {
    render(<Preview content={"| a | b |\n|---|---|\n| 1 | 2 |"} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("falls back to plain markdown when MDX cannot parse", () => {
    // `<` followed by a digit is valid markdown text but invalid MDX. Without the
    // boundary this blanks the whole pane.
    render(<Preview content={"# Title\n\nCompare 3 <5 and stop."} />);
    expect(screen.getByText(/MDX could not be parsed/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
  });

  it("keeps markdown formatting inside a component", () => {
    render(<Preview content={"<Card title=\"T\">Some **bold** text.</Card>"} />);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });

  describe("Tabs", () => {
    const doc = [
      '<Tabs defaultValue="second">',
      '  <Tab value="first" label="First">Panel one</Tab>',
      '  <Tab value="second" label="Second">Panel two</Tab>',
      "</Tabs>",
    ].join("\n");

    it("honours defaultValue and registers every tab", () => {
      // Tabs cannot introspect children — MdxNode wraps them — so each Tab
      // registers through context. This asserts that wiring actually works.
      render(<Preview content={doc} />);

      expect(screen.getAllByRole("tab")).toHaveLength(2);
      expect(screen.getByText("Panel two")).toBeInTheDocument();
      expect(screen.queryByText("Panel one")).not.toBeInTheDocument();
    });

    it("switches panels on click", async () => {
      render(<Preview content={doc} />);
      await userEvent.click(screen.getByRole("tab", { name: "First" }));

      expect(screen.getByText("Panel one")).toBeInTheDocument();
      expect(screen.queryByText("Panel two")).not.toBeInTheDocument();
    });

    it("falls back to the first tab when defaultValue names nothing", () => {
      render(<Preview content={doc.replace('defaultValue="second"', 'defaultValue="ghost"')} />);
      expect(screen.getByText("Panel one")).toBeInTheDocument();
    });
  });
});
