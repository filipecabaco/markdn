# Product

## Register

product

## Users

Developers and technical writers who live in markdown for hours at a stretch, on a
large display, in a native desktop window. They arrive with a job already in mind:
read a document, edit a passage, check that a diagram or component renders. They
are fluent in Linear, Raycast, Figma and their editor of choice, so an affordance
that behaves subtly differently from those costs them more than it teaches them.

A second class of user is not human. An MCP client reads and writes the same files
through the same server while a person has them open. The interface has to make
that legible rather than surprising.

## Product Purpose

MarkDN is a markdown and MDX viewer and editor served by Francis into a Tauri
window. It renders what other previewers will not: registered MDX components,
mermaid diagrams, syntax-highlighted code, all without evaluating anything from the
document. It exposes the same documents over MCP so an agent and a person can work
on one file.

Success is that the tool disappears into reading and writing, and that a document
which renders here renders the same way everywhere else it is published.

## Brand Personality

Precision instrument. Engineered, exact, quietly confident. Tight micro-detail and
deliberate density rather than generous whitespace; the surface is a machined
panel, not a page. Voice is terse and factual: labels, not sentences; no
exclamation, no encouragement, no personality in the chrome.

## Anti-references

- **A generic VS Code clone.** Blue-accented dark chrome, icon rail, tab bar. The
  first reflex for anything with an editor pane, and the one to refuse hardest.
- **GitHub's markdown preview.** The default styled-markdown look every developer
  already has and does not need a second copy of.
- **Glassy, neon or gradient surfaces.** Blurred panels, glow, gradient text.
- Notion/Linear-adjacent SaaS softness: rounded cards, soft grays, purple accent.

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
