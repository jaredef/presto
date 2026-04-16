# Component Tree — Master Plan

**Status:** PLANNED
**Date:** 2026-04-06

## What It Is

A hierarchical tree view of the page's structure, displayed as a collapsible panel in the editor. Each node represents an element in the .htx source — components, HTML elements, directives. Clicking a node highlights the corresponding element in the canvas. Clicking an element in the canvas highlights the corresponding node in the tree.

## Why It Matters

The visual canvas shows the rendered output. The source view shows raw text. Neither shows the page's structure as a navigable hierarchy. The component tree fills this gap — the developer sees the nesting, the component names, the directive types, and can navigate the page by clicking either the tree or the canvas.

## How It Works

The tree is parsed from the .htx source string using regex patterns that match:
- `<htx:component src="/ui/name.htx" ...>` → Component node (shows name + key props)
- `<htx:each items="..." as="...">` → Loop node (shows items path)
- `<htx:if test="...">` / `<htx:else>` → Conditional nodes
- `<htx:data type="..." as="...">` → Data query node
- `<h1>` through `<h6>`, `<div>`, `<section>`, `<article>`, `<form>`, `<nav>` → HTML element nodes
- `<htx:auth>` / `<htx:unauth>` → Auth conditional nodes

Each node gets a stable ID based on its byte offset in the source. When the source changes (from visual editing or AI chat), the tree re-parses and preserves the expanded/collapsed state of unchanged nodes.

## Phases

### Phase 1: Tree Parser
Parse .htx source into a flat node list with depth tracking.

Files:
- editor/public/js/component-tree.js

Node structure:
```javascript
{
  id: "node-0",        // stable ID from source position
  type: "component",   // component | element | directive | loop | conditional
  name: "card",        // component name or element tag
  label: "Card",       // display label
  detail: 'title="Hello"', // key prop or attribute summary
  depth: 0,            // nesting level
  start: 45,           // byte offset in source
  end: 180,            // byte offset end
  children: [],        // child node IDs
}
```

The parser walks the source character by character tracking open/close tags and nesting depth. It does NOT build a full DOM — it identifies the structural nodes that matter for navigation.

### Phase 2: Tree UI
Render the tree as an indented list with expand/collapse toggles, icons per node type, and click-to-select.

Additions to component-tree.js:
- Render function that outputs HTML into a container div
- Indent per depth level (16px per level)
- Icons: 📦 component, 🔄 loop, ❓ conditional, 📊 data, 🏷️ element, 🔒 auth
- Collapse/expand: click the arrow toggles children visibility
- Selected state: highlighted background on the active node
- Hover state: subtle background highlight

### Phase 3: Canvas Highlighting
When a tree node is selected:
1. The tree sends a postMessage to the canvas iframe with the node's source position
2. The preview.html injects builder-IDs during rendering (already implemented)
3. The canvas highlights the corresponding element with a blue outline
4. The canvas scrolls the element into view

When a canvas element is clicked:
1. The canvas sends the element's builder-ID to the parent
2. The tree finds the node matching that source position
3. The tree scrolls to and highlights that node
4. The property panel shows the node's editable props

### Phase 4: Integration with Editor
- Add a tree container to the editor layout (left panel, below the palette, or as a tab alongside the palette)
- The tree re-parses on every source change (effect on source signal)
- Preserve expanded/collapsed state across re-parses
- Keyboard navigation: arrow keys to move up/down, Enter to select, left/right to collapse/expand

### Phase 5: Tree Actions
Right-click or action buttons on tree nodes:
- **Delete** — removes the node from the source
- **Duplicate** — copies the node below itself
- **Move up/down** — reorders sibling nodes
- **Wrap in...** — wraps the node in a div, section, or component
- Each action modifies the source string and triggers the preview loop

## Layout Integration

The tree can be placed in one of two positions:

**Option A — Below the palette (stacked):**
```
├─────────��┬─────────────
│ Palette  │  Canvas
│──────────│
│ Tree     │
├──────────┴─────────────
│ Chat
```

**Option B — As a tab alongside the palette:**
```
├──────────┬─────────────
│[Palette] │  Canvas
│[Tree]    │
│ (tabbed) │
├──────────┴─────────────
│ Chat
```

Option B is cleaner — the left panel has two tabs (Components / Tree) and the user switches between them. The palette is for adding new things. The tree is for navigating existing things.

## Test Criteria
- Tree displays all components, elements, and directives from the source
- Nesting depth is correct (children indented under parents)
- Clicking a tree node highlights the canvas element
- Clicking a canvas element highlights the tree node
- Source changes re-parse the tree without losing expand/collapse state
- Delete/duplicate/move actions modify the source correctly
- Keyboard navigation works (arrows, enter, escape)
