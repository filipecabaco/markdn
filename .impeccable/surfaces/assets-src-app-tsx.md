---
version: 2
slug: "assets-src-app-tsx"
primary_target: "assets/src/App.tsx"
related_targets: ["assets/src/index.css"]
---

# markdn app shell

Scope: the whole app shell (App.tsx and its components): sidebar, bar, panes, overlays, the phone layout. Mode: Operate.

Audience and job: people who read and write markdown in a desktop window, on an iPad and on an iPhone. Job: find a document, read it rendered, jump around it, fix or write a passage, see when an agent changed it.

Constraints: Tauri webview (WebKit/WKWebView); strict CSP, so fonts and scripts are bundled; safe areas on iOS; both appearances; rendering fidelity of MDX, mermaid and code untouched; keyboard shortcuts keep working.

## Direction contract

THESIS: The page, and nothing louder. A stock shadcn shell (the same system as yaah) around the document, so nothing in the chrome needs learning and the rendered text is the only thing with weight or colour.

OWN-WORLD: zinc neutrals, Geist, one 0.625rem radius, hairline borders, flat. One brand blue, in the mark only. Sentence case. Lucide icons. See DESIGN.md for the tokens.

FIRST VIEWPORT: a 16rem sidebar (wordmark, search field to the palette, the document tree, the outline), a 3rem bar over the document (path and state left; view toggle, settings and Save right), source and render side by side. iPhone: the rendered document under a slim bar, a tab bar for Read, Documents, Outline and Search.

## Unresolved

- Screenshots in docs/ still show the previous (transit) design and need retaking.
