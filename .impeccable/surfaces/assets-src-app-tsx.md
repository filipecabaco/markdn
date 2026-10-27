---
version: 1
slug: "assets-src-app-tsx"
primary_target: "assets/src/App.tsx"
related_targets: ["assets/src/styles.css"]
---

# MarkDN app shell — iPad and iPhone first

Scope: the whole app shell (App.tsx and its components, styles.css): rail, top bar, panes, sheets. Mode: Operate.

Audience and job: people who read and write markdown on an iPad held or propped (touch first, keyboard sometimes) and on an iPhone (read first, light edits); the desktop window follows the same world. Job: find a document, read it rendered, jump around it, fix or write a passage, see when an agent changed it.

Constraints: iOS WebView (WKWebView) inside Tauri; safe areas; 44pt targets; HIG navigation (tab bar on iPhone, sheets for focused tasks); both appearances; rendering fidelity of MDX, mermaid and code untouched; keyboard shortcuts keep working when a keyboard is attached.

## Direction contract

THESIS: A document is a line. Its headings are stations on a coloured line, your scroll position is the train, and agent changes are service alerts on the stations they touched. Refuses the category default of a grey list sidebar beside a grey page.

OWN-WORLD: Midnight enamel shell on every edge (rail, top bar, tab bar), porcelain document card inset with a 14px radius (deep enamel card in dark). Four line inks, scarlet, cobalt, amber, green, one per top-level folder, used only as lines, station rings and state. Labels in DIN Condensed, uppercase and tracked; numerals in DIN Alternate; prose and UI body in the system face; code in ui-monospace. Hairline porcelain outlines, 45° and 90° bends, no shadows, no gradients.

STORY: The visitor sees their folders as lines and their documents as stations, opens one, reads it rendered, and always knows where they are on its line; a tap on a station jumps there, Edit brings the source in, an amber alert says an agent changed a section.

FIRST VIEWPORT: iPad landscape. Left, a 300px midnight rail: the MarkDN line mark, the folder's line drawn vertically with each document a station and the open one an interchange ring, line chips for the other folders above it. Top, a 56px midnight bar: LINE · STATION path in DIN Condensed, the Source / Split / Render segmented control centred, Save on the right (scarlet when there are edits). The rest, the porcelain card: the document's own line in a 56px gutter at its left edge, headings as station ticks with the current one ringed, source and render side by side. iPhone: the card full width under a midnight bar, the document rendered, a tab bar (Documents, Outline, Search, Settings), Edit top right.

FORM: catalog challenger wayfinding-cartography-signage-midnight-transit-diagram, dealt challenger 5 of 6, chosen over the assigned card catalogue; seed:0cdd382d4ceb0a37. Signature move: the outline line, heading stations, the train ring that follows scroll, amber service alerts for agent edits.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Folder-to-line colour assignment beyond four top-level folders (cycle, or grey "branch" lines).
- Whether the desktop window keeps a dense variant of the rail.
