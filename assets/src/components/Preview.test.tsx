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
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
  });

  it("says nothing about MDX for a .md file that is simply not MDX", () => {
    // A README with unclosed <img> tags is correct markdown. Reporting it as a
    // broken document is the interface being wrong out loud.
    render(<Preview content={"Compare 3 <5."} documentPath="notes/README.md" />);
    expect(screen.queryByText(/MDX could not be parsed/)).not.toBeInTheDocument();
  });

  it("reports the parse error on a document that meant to be MDX", () => {
    render(<Preview content={"Compare 3 <5."} documentPath="notes/page.mdx" />);
    expect(screen.getByText(/MDX could not be parsed/)).toBeInTheDocument();
  });

  it("reports the parse error when a component is used in a .md file", () => {
    // Here the author did mean MDX, so a silent downgrade would hide the typo
    // that stopped their component from rendering.
    render(<Preview content={"<Alert title='x'>hi</Alert>\n\n3 <5"} documentPath="a.md" />);
    expect(screen.getByText(/MDX could not be parsed/)).toBeInTheDocument();
  });

  describe("raw HTML in the plain fallback", () => {
    // A README's badge row: valid markdown, invalid MDX (<img> never closes).
    const readme = [
      '<p align="center">',
      '  <a href="https://yarnpkg.com/">',
      '    <img alt="Yarn" src="https://example.com/kitten.png" width="546">',
      "  </a>",
      "</p>",
      "",
      "**Fast:** it caches.",
    ].join("\n");

    it("renders the HTML instead of printing its source", () => {
      render(<Preview content={readme} documentPath="README.md" />);

      expect(screen.getByRole("img", { name: "Yarn" })).toBeInTheDocument();
      expect(screen.getByRole("link")).toHaveAttribute("href", "https://yarnpkg.com/");
      expect(screen.queryByText(/<p align/)).not.toBeInTheDocument();
      expect(screen.getByText("Fast:").tagName).toBe("STRONG");
    });

    it("strips anything executable out of it", () => {
      // The window can read and write the user's disk through the local API, so
      // a document is never allowed to bring script with it.
      const { container } = render(
        <Preview
          content={'<img src="x" onerror="alert(1)">\n\n<script>alert(2)</script>\n'}
          documentPath="README.md"
        />,
      );

      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("img")?.getAttribute("onerror")).toBeNull();
    });
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
