# Design

Visual system for MarkDN. Strategic context lives in [PRODUCT.md](PRODUCT.md);
this file is what the interface looks like. Tokens are defined in
`assets/src/styles.css` — that file is the implementation, this is the rationale.

## Theme

Precision instrument. Warm graphite panels, hairline separators, near-zero radii,
tight density, and a single signal red reserved for state. The reference is
industrial measuring equipment rather than developer tooling: a machined panel
where the readout is the only thing allowed to be loud.

Both light and dark are designed surfaces selected by `prefers-color-scheme`, not
one palette with inverted tokens. Neither is the "real" one.

## Color

Strategy: **Restrained**. Tinted neutrals plus one accent, well under 10% of any
screen. OKLCH throughout; nothing is `#000` or `#fff`, and every neutral carries a
small warm tint (chroma 0.005–0.010 around hue 70–80) so the greys read as paper
and metal rather than as television static.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--canvas` | `0.955 0.004 75` | `0.195 0.005 70` | Window ground |
| `--panel` | `0.925 0.005 75` | `0.228 0.006 70` | Header, sidebar, rail, chrome |
| `--surface` | `0.985 0.003 80` | `0.168 0.005 70` | The document itself |
| `--line` | `0.865 0.006 75` | `0.300 0.007 70` | Decorative hairlines |
| `--line-strong` | `0.775 0.008 75` | `0.385 0.008 70` | Container edges |
| `--line-control` | `0.592 0.010 70` | `0.520 0.009 70` | Interactive control borders |
| `--ink` | `0.245 0.010 70` | `0.920 0.006 80` | Body text |
| `--ink-muted` | `0.495 0.008 70` | `0.665 0.007 75` | Secondary text |
| `--ink-faint` | `0.505 0.008 70` | `0.635 0.008 75` | Labels, metadata |
| `--signal` | `0.508 0.185 30` | `0.660 0.180 33` | Selection, focus, active, primary |

Source highlighting is the one place with hues past the neutrals, and it gets six
tokens rather than a theme:

| Token | Light | Dark | Role |
|---|---|---|---|
| `--syn-marker` | `0.620 0.008 70` | `0.560 0.008 70` | `#`, `>`, bullets, fences, `**` |
| `--syn-heading` | `0.245 0.010 70` | `0.940 0.006 80` | Heading text |
| `--syn-code` | `0.450 0.070 160` | `0.780 0.080 160` | Code spans and fenced blocks |
| `--syn-link` | `0.450 0.090 250` | `0.760 0.090 250` | Link and image labels |
| `--syn-url` | `0.510 0.050 250` | `0.700 0.050 250` | Destinations |
| `--syn-html` | `0.470 0.070 300` | `0.780 0.080 300` | HTML and component tags |

Chroma stays at 0.05–0.09 against the signal's 0.18, so a highlighted document
still reads as a document. The quietest token is the punctuation the author typed
and the reader mostly does not need; the loudest is the text itself. Highlighting
never uses `--signal`, which in the source pane means the caret's block and a
search hit — state, as everywhere else.

`--line-control` exists separately from `--line-strong` because WCAG 1.4.11 wants
3:1 for the boundary that identifies a control, while a hairline that merely
separates two regions should stay quiet. Collapsing them makes one of the two
wrong.

**Signal red is only ever state**: current selection, caret's block, focus ring,
the dirty indicator, the primary action. It is never decoration, and never applied
to an inactive control.

## Typography

One family. `system-ui` for the interface and prose, `ui-monospace` for source and
code — no display face anywhere, since every string here is a label, a path, or a
document.

Fixed rem scale at roughly 1.2 between steps, never fluid: this is viewed at a
consistent DPI, and a heading that shrinks inside a pane looks broken rather than
responsive.

`--t-micro` 11px · `--t-small` 12px · `--t-base` 13px · `--t-body` 15px

Prose is capped at 68ch. Tables, code and diagrams may run wider.

## Layout

Density is deliberate: a 38px header, a 232px sidebar (190px under 1000px), 2–3px
radii, and hairlines instead of shadows. There are no cards in the chrome — panels
are separated by 1px lines, which is what makes it read as one instrument rather
than a tray of floating objects.

Split view withdraws below 760px and the control is disabled, rather than offering
a mode that cannot be honoured. The multibuffer takes the pane area over on the
same terms: while it is up the view control is disabled, because the panes behind
it are not the thing on screen.

## Motion

120ms for state feedback, 180ms for anything larger, on `ease-out-quart`. Motion
conveys state only: hover, focus, active tab, the picker's entry. There are no
load sequences. The whole system is disabled under `prefers-reduced-motion`.

The sync rail is the one performance-sensitive animation: it translates a single
strip on scroll rather than re-rendering ticks, so scrolling stays at frame rate.

## Components

Every interactive element carries default, hover, focus-visible, active and
disabled. Focus is a 2px `--signal` outline at 1px offset; the source pane, which
suppresses its own outline, indexes focus with a 2px rule along its top edge.

The source pane is a textarea painted transparent over a highlight layer holding
the same characters. Nothing about the caret, the selection, undo or IME is
reimplemented, and the two boxes share one CSS rule so a glyph cannot land in one
place in the layer and another under the caret. Multibuffer excerpts are the same
surface at `--t-small`, gutter-numbered and not wrapped, so one line is one row.

MDX components (`Alert`, `Callout`, `Card`, `Tabs`) are full hairline boxes with a
tinted header strip. Deliberately **not** a coloured left border: that pattern is
banned, and a labelled header reads as an instrument panel where a stripe reads as
decoration.

## Brand

The mark is three stacked rules with the top one in signal red — blocks of a
document with the active one indexed, the same idea the sync rail draws between
the panes. Geometry only, so one drawing survives 16px in a tab and 1024px in an
app icon.

Source artwork: `assets/public/favicon.svg` (tab) and `tmp/app-icon.svg` →
`src-tauri/icons/` via `cargo-tauri icon`. The app icon bakes in its own rounded
silhouette because `tauri icon` resizes but does not shape.

## Accessibility

WCAG 2.2 AA, verified in-browser in both themes: all text ≥ 4.5:1, all control
borders and focus indicators ≥ 3:1. Full keyboard reachability with visible focus.
`prefers-reduced-motion` honoured.
