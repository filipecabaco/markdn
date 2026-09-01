# MDX Component Editor - Research Summary

**Date:** February 9, 2026
**Status:** ✅ Research Complete, Architecture Decided

---

## The Question

**Can MarkDN support MDX components (custom React components) that can be edited and viewed in real-time?**

**Answer:** ✅ **Yes** - with a unified component registry approach

---

## What We Found

### Current Community Landscape

1. **MDXEditor (@mdxeditor/editor)** - BEST for our use case
   - Built on Lexical framework (Facebook's editor)
   - Native JSX support via `jsxPlugin()`
   - ~851 kB gzipped (acceptable for desktop app)
   - Used in production by Fumadocs, others

2. **TinaCMS** - Schema-driven approach
   - Template-based components
   - Auto-generated UI forms
   - More complex, more powerful

3. **Visual Builders** (Plasmic, Builder.io)
   - Drag-drop interface
   - JSON serialization
   - Overkill for markdown-based content

### Key Finding: MDXEditor Already Supports JSX! ✓

```tsx
<MDXEditor
  plugins={[
    jsxPlugin(),  // ← This is what we need!
    headingsPlugin(),
    // ...
  ]}
/>
```

We don't need to build a new editor - MDXEditor already has JSX support.

---

## The Problem: Current vs. Future

### Current Reality (MVP Works Fine)
```
Markdown File
  ↓
MDXEditor (pure markdown editing)
  ↓
react-markdown with custom components
  ↓
Rendered output (but no way to INSERT components)
```

**Missing:** Users can't insert custom components like `<Alert />` - they have to hand-code JSX

### Proposed Future (What Users Want)
```
Markdown + MDX Components File
  ↓
MDXEditor with:
  • Component registry
  • Cmd+Shift+C to insert component
  • Picker UI to select component
  • Props editor (optional)
  ↓
Same rendering pipeline
  ↓
Rendered output (now editable!)
```

**Gain:** Visual component insertion, props editor, validation

---

## Three Architecture Options We Evaluated

| Option | Approach | Effort | Complexity | Recommended |
|--------|----------|--------|-----------|------------|
| **1: Comments** | Extend HTML comments for components | Low | Medium | ❌ No |
| **2: JSX** | Real MDX/JSX syntax with picker | Medium | Medium | ✅ **YES** |
| **3: Schema** | TinaCMS-style form-driven | High | High | ⏳ Phase 2 |

---

## Recommendation: Option 2 (JSX Components)

### Why This Approach?

1. **Real MDX/JSX Syntax** - Not a hack
2. **MDXEditor Supports It** - Built-in via jsxPlugin()
3. **Clear Migration Path** - Phase 1 → Phase 2 → Phase 3
4. **Medium Effort** - 200-300 lines of new code
5. **No Breaking Changes** - Existing markdown files continue working

### What It Looks Like (User Perspective)

**Insert Component:**
- Press `Cmd+Shift+C`
- Select "Alert" from menu
- Component inserted: `<Alert type="warning" />`
- Click to edit props (future phase)

**In File:**
```mdx
# My Document

<Alert type="warning">
  This is a warning message
</Alert>

Regular markdown still works...
```

**In Preview:**
- Shows as styled alert box
- Same rendering as editor

---

## Implementation Plan

### Phase 1: Component Picker (2 weeks)
- [ ] Create component registry
  ```tsx
  export const MDX_COMPONENT_REGISTRY = {
    Alert: AlertComponent,
    Card: CardComponent,
    // ...
  };
  ```
- [ ] Add component metadata (label, icon, description)
- [ ] Build component picker UI (dropdown menu)
- [ ] Add keyboard shortcut (Cmd+Shift+C)
- [ ] First component: Alert

### Phase 2: Props Editor (1 week, optional)
- [ ] Define component schemas (zod-based)
- [ ] Auto-generate form UI from schema
- [ ] Props validation and documentation
- [ ] For components with complex configurations

### Phase 3: Advanced (Future)
- [ ] Live preview with Sandpack
- [ ] Component library marketplace
- [ ] Plugin system for custom components
- [ ] Visual builder (drag-drop)

---

## First Component: Alert

```tsx
// src/components/Alert.tsx
export interface AlertProps {
  type: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children?: React.ReactNode;
}

export function Alert({ type, title, children }: AlertProps) {
  const icons = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
    success: '✅'
  };

  return (
    <div className={`alert alert-${type}`}>
      <div className="alert-header">
        <span>{icons[type]}</span>
        {title && <span>{title}</span>}
      </div>
      {children && <div className="alert-content">{children}</div>}
    </div>
  );
}

// Metadata (for picker and future schema)
export const AlertMetadata = {
  label: "Alert",
  description: "Highlighted message box",
  icon: "⚠️",
  schema: {
    type: { type: "select", options: ["info", "warning", "error", "success"] },
    title: { type: "string", optional: true },
  }
};
```

---

## Why This Works

### Architecture Alignment
- ✅ Leverages existing MDXEditor (no new dependency)
- ✅ Uses existing react-markdown rendering
- ✅ Unifies editor and reader (same components)
- ✅ Fits Tauri desktop app (bundle size acceptable)

### Security
- ✅ Trusted content only (no `eval()`)
- ✅ Component registry validation
- ✅ No arbitrary code execution
- ✅ Can sandbox complex components later (Sandpack)

### Performance
- ✅ Lazy-loaded components
- ✅ Tree-shakeable (only load used components)
- ✅ No rendering overhead
- ✅ MDXEditor JSX support is native (no plugins)

### User Experience
- ✅ Visual component picker (not manual JSX)
- ✅ Props editor (future)
- ✅ Real MDX syntax (not a hack)
- ✅ Easy to extend with new components

---

## What We're NOT Doing

❌ **Building a visual page builder** (too complex)
❌ **Runtime code evaluation** (security risk)
❌ **Reinventing MDXEditor** (already mature)
❌ **Supporting arbitrary JSX** (only registered components)
❌ **Immediate schema-driven approach** (Phase 2)

---

## Examples: What Users Can Build

### 1. Warning/Info Boxes
```mdx
<Alert type="warning" title="Important">
  Pay attention to this information
</Alert>
```

### 2. Feature Cards
```mdx
<Card title="New Feature" subtitle="v2.0">
  This is a new feature we added
</Card>
```

### 3. Tabbed Content
```mdx
<Tabs defaultValue="js">
  <Tab value="js">JavaScript code here</Tab>
  <Tab value="ts">TypeScript code here</Tab>
</Tabs>
```

### 4. Data Tables
```mdx
<Table
  columns={["Name", "Age", "City"]}
  data={[["Alice", 30, "NYC"], ...]}
/>
```

### 5. Interactive Callouts
```mdx
<Callout type="tip" title="Pro Tip">
  You can use markdown **inside** components
</Callout>
```

---

## Risks & Mitigations

| Risk | Probability | Mitigation |
|------|-------------|-----------|
| Props serialization becomes chaotic | Medium | **Enforce schema early** |
| Component registry grows too large | Low | **Lazy load, plugin system** |
| JSX syntax confuses users | Medium | **Good docs, autocomplete, UI picker** |
| Performance regression | Low | **Test with 500+ line documents** |
| Breaking changes needed later | Low | **Design for extensibility now** |

---

## Timeline

**Phase 1 (Recommended - After VSCode Extension):**
- Start: Week of Feb 24, 2026
- Duration: 2 weeks
- Deliverable: Component picker + Alert component

**Phase 2 (Optional - Q2 2026):**
- Props editor with schema
- 1 week effort

**Phase 3 (Future - Post-MVP):**
- Advanced features (Sandpack, marketplace, etc.)

---

## Decision: Go/No-Go

### ✅ RECOMMENDATION: **PROCEED WITH PHASE 1**

**Rationale:**
1. Low risk (leverages existing MDXEditor)
2. High impact (real MDX component support)
3. Medium effort (200-300 lines of code)
4. Clear roadmap (Phase 1 → 2 → 3)
5. Aligns with "preview-first" philosophy

**Next Step:** Start Phase 1 after VSCode extension

---

## References

- **Full Research:** See [EXPLORATION.md](./EXPLORATION.md)
- **Updated Plan:** See [PLAN.md](./PLAN.md) - MDX Component System section
- **Implementation:** Will be tracked in PR with reference to this doc

---

**Research Conducted By:** Researcher Agent (a8c99d4)
**Date:** February 9, 2026
**Sources:** 20+ GitHub projects, official MDX docs, TinaCMS, Plasmic, Builder.io, community discussions
