---
name: markdn
description: A markdown and MDX reader-editor in the stock shadcn idiom, where the document is the only loud thing on screen.
colors:
  background: "oklch(1 0 0)"
  background-dark: "oklch(0.145 0 0)"
  foreground: "oklch(0.145 0 0)"
  foreground-dark: "oklch(0.985 0 0)"
  card: "oklch(1 0 0)"
  card-dark: "oklch(0.205 0 0)"
  popover: "oklch(1 0 0)"
  popover-dark: "oklch(0.205 0 0)"
  primary: "oklch(0.205 0 0)"
  primary-dark: "oklch(0.922 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  primary-foreground-dark: "oklch(0.205 0 0)"
  secondary: "oklch(0.97 0 0)"
  secondary-dark: "oklch(0.269 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-dark: "oklch(0.269 0 0)"
  muted-foreground: "oklch(0.556 0 0)"
  muted-foreground-dark: "oklch(0.708 0 0)"
  accent: "oklch(0.97 0 0)"
  accent-dark: "oklch(0.269 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  destructive-dark: "oklch(0.704 0.191 22.216)"
  border: "oklch(0.922 0 0)"
  border-dark: "oklch(1 0 0 / 10%)"
  input: "oklch(0.922 0 0)"
  input-dark: "oklch(1 0 0 / 15%)"
  ring: "oklch(0.708 0 0)"
  ring-dark: "oklch(0.556 0 0)"
  sidebar: "oklch(0.985 0 0)"
  sidebar-dark: "oklch(0.205 0 0)"
  brand: "oklch(0.58 0.18 262)"
  brand-dark: "oklch(0.68 0.16 260)"
typography:
  ui:
    fontFamily: '"Geist Variable", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  ui-strong:
    fontFamily: '"Geist Variable", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: '"Geist Variable", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
  wordmark:
    fontFamily: '"Geist Variable", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.9375rem"
    fontWeight: 600
    letterSpacing: "-0.01em"
  doc-h1:
    fontFamily: '"Geist Variable", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  doc-h2:
    fontFamily: '"Geist Variable", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  doc-h3:
    fontFamily: '"Geist Variable", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: '"Geist Variable", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  base: "0.625rem"
  sm: "calc(0.625rem * 0.6)"
  md: "calc(0.625rem * 0.8)"
  lg: "0.625rem"
  xl: "calc(0.625rem * 1.4)"
  full: "9999px"
spacing:
  control: "2.25rem"
  control-sm: "2rem"
  sidebar: "16rem"
  bar: "3rem"
components:
  button-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.ui-strong}"
    rounded: "{rounded.md}"
    height: "{spacing.control}"
    padding: "0 16px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.ui-strong}"
    rounded: "{rounded.md}"
    height: "{spacing.control}"
    padding: "0 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.ui-strong}"
    rounded: "{rounded.md}"
    height: "{spacing.control}"
    padding: "0 12px"
  button-ghost-hover:
    backgroundColor: "{colors.accent}"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    height: "{spacing.control}"
    padding: "0 12px"
  sidebar-row:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    height: "{spacing.control-sm}"
    padding: "0 8px"
  sidebar-row-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.foreground}"
  popover:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
  code-block:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
  mdx-component:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
---

# Design System: markdn

## Overview

**North star: "The page, and nothing louder."**

markdn is a quiet tool around a loud document. The interface is stock shadcn on Tailwind 4, the same idiom as its sibling app yaah: zinc neutrals, Geist, one 0.625rem radius, hairline borders, flat surfaces. The chrome is a sidebar, a thin bar over the document, and overlays when asked for. None of it competes with the text and the rendered output, which are the only things on screen allowed to carry weight or colour.

There is exactly one brand colour, a calm blue, and it lives in the mark. Everything else is neutral: state is shown with weight, a muted background, an icon or a word, never with a palette of its own. Light and dark are the shadcn neutral scales, switched by a `.dark` class that follows the system or the theme setting.

**Key characteristics:**
- Stock shadcn components and tokens; no bespoke visual world to learn.
- Zinc neutrals in both themes; one brand blue, in the mark only.
- Geist for the interface and for prose; `ui-monospace` for source and code.
- Sentence case everywhere. No uppercase signage, no tracked labels.
- Flat: borders, not shadows; no gradients, no glass.
- Motion only for state, and none under reduced motion.

## Colors

The shadcn neutral palette, copied from yaah's `index.css` so the two apps read as one family.

- **Background / Foreground:** white and near-black in light; near-black and near-white in dark. The document pane sits directly on Background.
- **Card / Popover:** the same as Background in light, one step up (`oklch(0.205 0 0)`) in dark. Menus, the palette, settings and MDX components use them.
- **Muted / Accent / Secondary:** one light grey step. Hover rows, the selected sidebar row, code blocks, inline code, table headers.
- **Muted foreground:** secondary text: paths, hints, timestamps, the saved/edited state, key hints.
- **Border / Input / Ring:** hairlines, field outlines and the focus ring.
- **Destructive:** errors and the Move to Trash item. Nothing else is red.
- **Brand** (`oklch(0.58 0.18 262)`, dark `oklch(0.68 0.16 260)`): the middle stem of the mark. Never themed, never used for controls, links or state.

### Named rules
**The One Colour Rule.** Brand blue is the mark's, and only the mark's. If a control needs emphasis, it gets the primary (near-black) treatment, not the brand colour.

**The Document Speaks Rule.** Rendered content (code highlighting, mermaid, MDX components) takes its colours from the same neutral tokens, so a document looks like a document, not like a theme.

## Typography

**Interface and prose:** Geist Variable, bundled with the app (`@fontsource-variable/geist`), falling back to `system-ui`.
**Source and code:** `ui-monospace` (SF Mono, Menlo).

- **UI** (400, 0.875rem): sidebar rows, menus, fields, buttons (500).
- **Label** (500, 0.75rem): section headings in the sidebar and palette, in Muted foreground, sentence case.
- **Wordmark** (600, 0.9375rem, -0.01em): "markdn", always lowercase, beside the mark.
- **Document headings:** h1 1.75rem, h2 1.375rem with a hairline beneath, h3 1.125rem, all 600 with slight negative tracking.
- **Body** (400, 1rem, 1.7): rendered prose, capped at about 70ch.
- **Mono** (0.875rem, 1.7): the source pane, sized from settings; code blocks the same.

## Layout

- **Sidebar** (16rem, collapsible with ⌘B): the wordmark at the top, a search field that opens the palette, the root folder name, then the document tree; the outline of the open document below it when there is one.
- **Bar** (3rem): the document's path and saved/edited state on the left; the Source / Split / Render toggle, settings and Save on the right.
- **Panes:** source and render as two equal columns in split view with a hairline between them; one column in the other two views.
- **Narrow screens:** the sidebar becomes a sheet over the document; on a phone, a bottom tab bar switches between Read, Documents, Outline and Search.

## Elevation & depth

Flat. Surfaces are separated by a 1px border and, in dark, by the one-step lighter card colour. Overlays are bordered popovers over an optional dimmed backdrop; no drop shadows beyond shadcn's default `shadow-sm`/`shadow-md` on popovers.

## Shapes

One radius, `--radius: 0.625rem`, with shadcn's derived steps: `sm` for small chips and inline code, `md` for buttons, fields and rows, `lg` for popovers, cards and code blocks, `xl` for sheets. Nothing is a pill except badges.

## Components

All controls are shadcn primitives (Button, Input, Dialog, Popover, DropdownMenu/ContextMenu, Tooltip, Tabs, Switch, Select, ScrollArea, Separator, Badge) themed only through the tokens above. Icons are lucide, 16px, 1.75 stroke.

- **Document tree:** a plain tree: folder rows with a chevron and folder icon, document rows with a file icon. The open document's row has the Accent background and medium weight. Arrow keys walk it; ⇧F10 opens the row's menu.
- **Outline:** the open document's headings as an indented list (h1–h3); the section in view is shown with foreground text and medium weight, the rest in Muted foreground. A section an agent changed carries a small dot and "changed" for assistive technology until visited.
- **Command palette:** a dialog with an input, grouped results (Recent, Documents, Commands) and key hints in the footer; matched characters in 600 weight.
- **Decision bar:** a bordered strip under the bar for choices that must not be a modal (unsaved edits about to be replaced, a file changed on disk). First action is the default button, the rest outline; Escape takes the last, which always changes nothing.
- **MDX components** (Alert, Callout, Card, Tabs): bordered cards with a small header row. Alerts carry a lucide icon so the four kinds differ in shape, not only colour; error uses Destructive, the rest stay neutral.
- **Mark:** four rounded tiles forming an "m": a top bar and three stems, the middle stem in brand blue, the rest in the current text colour so it sits in either theme. The start-up indicator slides the tiles into place in a loop.

## Do's and don'ts

### Do
- **Do** reach for a stock shadcn component before writing a custom one.
- **Do** keep labels in sentence case and the name lowercase: "markdn".
- **Do** theme anything drawn in the document (mermaid included) from the neutral tokens, so it follows light and dark.
- **Do** show keyboard focus with the ring token, and keep every control reachable from the keyboard.
- **Do** honour `prefers-reduced-motion`: every animation has a static equivalent.

### Don't
- **Don't** use the brand blue on anything but the mark.
- **Don't** add coloured side stripes, gradients, glass, glow or heavy shadows.
- **Don't** set anything in uppercase or a condensed face.
- **Don't** give folders or documents colours of their own; the tree is neutral.
