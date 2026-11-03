# Product

## Register

product

## Users

Developers and technical writers who live in markdown, first on an **iPad** held or
propped up â touch first, a keyboard attached for longer writing â and on an
**iPhone**, where they mostly read and make light edits: a typo, a line, a checkbox.
The desktop window is the third place, and follows the same design. They arrive
with a job already in mind: read a document, find their place in it, fix a
passage, check that a diagram or component renders. They are fluent in iPadOS and
iOS apps, so a control that behaves differently from the platform's costs them
more than it teaches them.

A second class of user is not human. An MCP client reads and writes the same files
through the same server while a person has them open. The interface has to make
that legible rather than surprising.

## Product Purpose

markdn is a markdown and MDX viewer and editor served by Francis into a Tauri
window. It renders what other previewers will not: registered MDX components,
mermaid diagrams, syntax-highlighted code, all without evaluating anything from the
document. It exposes the same documents over MCP so an agent and a person can work
on one file.

Success is that the tool disappears into reading and writing, and that a document
which renders here renders the same way everywhere else it is published.

## Brand Personality

Quiet and exact. The chrome is stock and recedes; the document is the only thing
with presence. Voice is terse and factual: labels, not sentences; sentence case;
no exclamation, no encouragement, no personality in the chrome.

## Brand Commitments

- Name: "markdn", always lowercase, in the app, the bundle, the docs and the
  command (`markdn README.md`).
- Logo: four rounded tiles forming an "m" — a top bar over three stems — with the
  middle stem in the one brand blue and the rest in the text colour, so it sits in
  any theme. A sibling of yaah’s tile "y".
- Look: the same stock shadcn system as yaah (zinc neutrals, Geist, one radius),
  so the two apps read as one family.

## Anti-references

- **A generic VS Code clone.** Blue-accented dark chrome, icon rail, tab bar. The
  first reflex for anything with an editor pane, and the one to refuse hardest.
- **GitHub's markdown preview.** The default styled-markdown look every developer
  already has and does not need a second copy of.
- **Glassy, neon or gradient surfaces.** Blurred panels, glow, gradient text.
- **A bespoke visual world.** Themed metaphors, custom signage, decorative colour
  coding. Every one of them is something to learn before the document can be read.

## Design Principles

1. **The document is the product.** Chrome recedes; the text and the rendered
   output are the only things allowed to be visually loud. Any pixel of interface
   that is not carrying state should get quieter.
2. **Never hesitate.** Latency is a design defect, not an engineering detail. At any
   document size, typing, scrolling and switching files stay at frame rate.
3. **Source and render are one document.** The two panes are two views of the same
   thing and should be provably in sync, not two independent scrollers that happen
   to sit side by side.
4. **Earned familiarity.** Standard affordances behave in the standard way. Novelty
   is spent on how the tool feels, never on reinventing a scrollbar or a control.
5. **Agent activity is visible.** When something other than the person changes the
   document, the interface says so plainly instead of silently swapping content.

## Accessibility & Inclusion

WCAG 2.2 AA across both themes: AA contrast for all text and UI state, full
keyboard reachability with visible focus, correct roles for the tab and tree
widgets. `prefers-reduced-motion` is honoured everywhere, with a static
alternative that still communicates state. Both light and dark are designed
surfaces, selected by `prefers-color-scheme`, not one theme with inverted tokens.
