import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import * as api from "./api";

vi.mock("./api", () => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  getSession: vi.fn(),
  saveSession: vi.fn(),
  listDocuments: vi.fn(),
  readDocument: vi.fn(),
  saveDocument: vi.fn(),
  createDocument: vi.fn(),
  renameDocument: vi.fn(),
  trashDocument: vi.fn(),
  searchDocuments: vi.fn(),
  searchContents: vi.fn(),
}));

/** Stands in for the live-sync socket, so a test can play another writer. */
class FakeSocket {
  static last: FakeSocket | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor() {
    FakeSocket.last = this;
  }
  emit(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const FILES: Record<string, string> = { "a.md": "# A", "b.md": "# B" };

beforeEach(() => {
  vi.stubGlobal("WebSocket", FakeSocket);
  // A 1280px desktop window: every width bound in the query is checked against
  // it, so the iPad and iPhone layouts stay out of these tests.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches:
      /width/.test(query) &&
      [...query.matchAll(/(min|max)-width:\s*(\d+)px/g)].every(([, bound, value]) =>
        bound === "min" ? 1280 >= Number(value) : 1280 <= Number(value),
      ),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

  const settings: api.Settings = {
    root: null,
    theme: "system",
    // Source view only: the preview would pull in mermaid and shiki for nothing.
    defaultView: "editor",
    editorFontSize: 13,
    showHiddenFiles: false,
    autoScrollSpeed: 40,
    sidebarCollapsed: false,
  };
  const response = (current: typeof settings) => ({
    settings: current,
    defaults: settings,
    path: "/cfg/settings.json",
    root: "/notes",
    rootLocked: false,
  });
  vi.mocked(api.getSettings).mockResolvedValue(response(settings));
  // Answers like the server: the stored settings with the patch merged in.
  let stored = settings;
  vi.mocked(api.saveSettings).mockImplementation((patch) => {
    stored = { ...stored, ...patch };
    return Promise.resolve(response(stored));
  });
  vi.mocked(api.listDocuments).mockResolvedValue({
    entries: [
      { name: "a.md", path: "a.md", type: "file" },
      { name: "b.md", path: "b.md", type: "file" },
    ],
  });
  vi.mocked(api.readDocument).mockImplementation((path) =>
    Promise.resolve({ path, contents: FILES[path] ?? "" }),
  );
  vi.mocked(api.saveDocument).mockResolvedValue({ saved: true });
  const empty: api.Session = { document: null, view: null, draft: null };
  vi.mocked(api.getSession).mockResolvedValue(empty);
  vi.mocked(api.saveSession).mockResolvedValue(empty);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function openFile(user: ReturnType<typeof userEvent.setup>, name: string) {
  const item = await screen.findByRole("treeitem", { name });
  await user.click(within(item).getByText(name));
}

async function dirtyA(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await openFile(user, "a.md");
  const editor = await screen.findByRole("textbox", { name: "Markdown source" });
  await waitFor(() => expect(editor).toHaveValue("# A"));
  await user.type(editor, " edited");
  expect(screen.getByText("edited")).toBeInTheDocument();
  return editor;
}

describe("unsaved edits", () => {
  it("asks before opening another document over them", async () => {
    const user = userEvent.setup();
    await dirtyA(user);

    await openFile(user, "b.md");

    const question = screen.getByRole("alertdialog", { name: "Unsaved changes in a.md." });
    expect(api.readDocument).not.toHaveBeenCalledWith("b.md");

    await user.click(within(question).getByRole("button", { name: "Save and open" }));

    await waitFor(() => expect(api.readDocument).toHaveBeenCalledWith("b.md"));
    expect(api.saveDocument).toHaveBeenCalledWith("a.md", "# A edited");
  });

  it("keeps them when the user says so", async () => {
    const user = userEvent.setup();
    const editor = await dirtyA(user);

    await openFile(user, "b.md");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(editor).toHaveValue("# A edited");
    expect(api.readDocument).not.toHaveBeenCalledWith("b.md");
  });

  it("does not let another writer's save silently replace them", async () => {
    const user = userEvent.setup();
    const editor = await dirtyA(user);

    FakeSocket.last?.emit({ type: "saved", path: "a.md" });

    const question = await screen.findByRole("alertdialog", {
      name: "a.md changed on disk while you were editing it.",
    });
    expect(editor).toHaveValue("# A edited");

    FILES["a.md"] = "# A from the agent";
    await user.click(within(question).getByRole("button", { name: "Reload from disk" }));
    await waitFor(() => expect(editor).toHaveValue("# A from the agent"));
    FILES["a.md"] = "# A";
  });

  it("reloads a clean document when it changes on disk, and says so", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openFile(user, "a.md");
    const editor = await screen.findByRole("textbox", { name: "Markdown source" });
    await waitFor(() => expect(editor).toHaveValue("# A"));

    FILES["a.md"] = "# A, rewritten";
    FakeSocket.last?.emit({ type: "saved", path: "a.md" });

    await waitFor(() => expect(editor).toHaveValue("# A, rewritten"));
    expect(screen.getByRole("status")).toHaveTextContent("a.md changed on disk and was reloaded.");
    FILES["a.md"] = "# A";
  });
});

describe("a window that reloads", () => {
  it("comes back on the document, in the view, with the unsaved edits", async () => {
    vi.mocked(api.getSession).mockResolvedValue({
      document: "a.md",
      view: "editor",
      draft: { path: "a.md", contents: "# A, half edited" },
    });
    render(<App />);

    const editor = await screen.findByRole("textbox", { name: "Markdown source" });
    await waitFor(() => expect(editor).toHaveValue("# A, half edited"));
    expect(screen.getByText("Your unsaved changes to a.md were kept.")).toBeInTheDocument();
  });

  it("opens the document as it is on disk when nothing was left unsaved", async () => {
    vi.mocked(api.getSession).mockResolvedValue({ document: "b.md", view: null, draft: null });
    render(<App />);

    const editor = await screen.findByRole("textbox", { name: "Markdown source" });
    await waitFor(() => expect(editor).toHaveValue("# B"));
  });

  it("keeps where the reader is and what they have not saved", async () => {
    const user = userEvent.setup();
    await dirtyA(user);

    await waitFor(() =>
      expect(api.saveSession).toHaveBeenCalledWith({ document: "a.md", view: "editor" }),
    );
    await waitFor(() =>
      expect(api.saveSession).toHaveBeenCalledWith({
        draft: { path: "a.md", contents: "# A edited" },
      }),
    );

    await user.keyboard("{Meta>}s{/Meta}");
    await waitFor(() => expect(api.saveSession).toHaveBeenCalledWith({ draft: null }));
  });
});

describe("the sidebar", () => {
  it("collapses from its button and comes back, remembering the choice", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("tree", { name: "Documents" });

    await user.click(screen.getByRole("button", { name: "Hide sidebar" }));

    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    expect(api.saveSettings).toHaveBeenCalledWith({ sidebarCollapsed: true });
    const show = screen.getByRole("button", { name: "Show sidebar" });
    expect(show).toHaveAttribute("aria-expanded", "false");

    await user.click(show);
    expect(await screen.findByRole("tree")).toBeInTheDocument();
  });

  it("toggles with Cmd+B, as in VS Code", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("tree");

    await user.keyboard("{Meta>}b{/Meta}");
    await waitFor(() => expect(screen.queryByRole("tree")).not.toBeInTheDocument());

    await user.keyboard("{Meta>}b{/Meta}");
    expect(await screen.findByRole("tree")).toBeInTheDocument();
  });

  it("opens again when New needs its name field", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("tree");
    await user.click(screen.getByRole("button", { name: "Hide sidebar" }));
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();

    await user.keyboard("{Meta>}n{/Meta}");

    expect(await screen.findByRole("textbox", { name: "New document path" })).toBeVisible();
    expect(screen.getByRole("tree")).toBeInTheDocument();
  });
});

describe("VS Code shortcuts", () => {
  const view = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

  it("opens Quick Open on Cmd+P", async () => {
    vi.mocked(api.searchDocuments).mockResolvedValue({ query: "", results: [] });
    Element.prototype.scrollIntoView ??= vi.fn();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("tree");

    await user.keyboard("{Meta>}p{/Meta}");

    expect(
      await screen.findByRole("combobox", { name: "Search documents or commands" }),
    ).toHaveValue("");
  });

  it("toggles the preview on Shift+Cmd+V, back to the view it left", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("tree");
    await waitFor(() => expect(view("Source")).toHaveAttribute("aria-pressed", "true"));

    await user.keyboard("{Meta>}{Shift>}v{/Shift}{/Meta}");
    expect(view("Render")).toHaveAttribute("aria-pressed", "true");

    await user.keyboard("{Meta>}{Shift>}v{/Shift}{/Meta}");
    expect(view("Source")).toHaveAttribute("aria-pressed", "true");
  });

  it("opens the preview to the side on the Cmd+K V chord, without typing the V", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openFile(user, "a.md");
    const editor = await screen.findByRole("textbox", { name: "Markdown source" });
    await waitFor(() => expect(editor).toHaveValue("# A"));
    await user.click(editor);

    await user.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for second key of chord");

    await user.keyboard("v");
    expect(view("Split")).toHaveAttribute("aria-pressed", "true");
    expect(editor).toHaveValue("# A");
  });

  it("says when a chord is not a command", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("tree");

    await user.keyboard("{Meta>}k{/Meta}x");

    expect(screen.getByRole("status")).toHaveTextContent("(⌘K, X) is not a command");
  });
});
