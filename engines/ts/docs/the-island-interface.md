# The Island Interface: Any React Package, One Standard Protocol

## The Problem We Solved

We proved that React can operate inside a PRESTO representation. React Query fetches data in a bounded div while the surrounding page is server-rendered HTML. Recharts draws interactive charts while the stats panel next to it is zero JavaScript. The encapsulation holds. The REST boundary is preserved. Both depths coexist.

But each proof was handcrafted. Each island wired its own `window.__mountX` global. Each page manually built the data bridge — `<template>` elements for embedded JSON, hidden inputs for channel tokens, a `tryMount` polling loop to handle async bundle loading. Adding a third island meant reimplementing the same boilerplate. A fourth island, the same again.

The standard island interface eliminates this. One protocol. One component. One build command. Any React npm package.

---

## What the Developer Writes

### The island definition (one file)

```typescript
// islands/my-chart.tsx
import { defineIsland } from "presto-ts/src/islands/define";
import { createRoot } from "react-dom/client";
import { BarChart, Bar, XAxis, YAxis } from "recharts";

defineIsland({
  name: "my-chart",
  mount(el, props) {
    createRoot(el).render(
      <BarChart width={600} height={300} data={props.data}>
        <XAxis dataKey="name" />
        <YAxis />
        <Bar dataKey="value" fill="#6366f1" />
      </BarChart>
    );
  },
});
```

The developer imports `defineIsland`, names the island, and writes a mount function. The mount function receives the DOM element and a props object. That's the entire API. The React component code is identical to what the developer already writes — same imports, same JSX, same props. Nothing changes about the React code. What changes is how it reaches the page.

### The build (one command)

```bash
bun cli/index.ts build-islands islands public/js/islands
```

Output:
```
  Building 1 island(s)...
  my-chart.js  840 KB  (92ms)
  Manifest: public/js/islands/islands.json
  1 island(s) built.
```

The CLI scans the islands directory, bundles each `.tsx` file with all its dependencies (React, ReactDOM, Recharts, D3 — everything), and outputs a self-contained JavaScript file. One file per island. No shared bundle. No chunk splitting. Each island carries exactly what it needs.

### The template (three lines)

```html
<!-- The data bridge: server-resolved data serialized for the island -->
<template id="island-data-my-chart"><htx:v raw>chartData | json</htx:v></template>

<!-- The island component: mount div + bootstrap script -->
<htx:component src="/ui/island.htx" name="my-chart">
  <p>Loading chart...</p>
</htx:component>
```

Three lines. The `<template>` element is the data bridge — the server resolved `chartData` via `htx:data` and serialized it as JSON. The `htx:component` renders a mount div and a bootstrap script that loads the bundle, reads the data, and calls the mount function.

The `<p>Loading chart...</p>` inside the component is the slot content — it renders as the fallback while the bundle loads, and it remains visible if JavaScript is disabled or the bundle fails to load. Graceful degradation is structural.

---

## What Happens Under the Hood

### The pipeline

When the engine processes the page:

1. **Stage 7** (component resolution): `island.htx` expands into a `<div data-island="my-chart">` with the fallback slot content and an `htx:script` bootstrap block.

2. **Stage 10** (data resolution): `htx:data` resolves `chartData` from SQLite.

3. **Stage 15** (expression evaluation): `<htx:v raw>chartData | json</htx:v>` inside the `<template>` evaluates to the serialized JSON array.

4. **Stage 20** (script injection): The bootstrap `htx:script` from `island.htx` is injected before `</body>` as an IIFE scoped to its mount div.

5. **Stage 22** (finalization): Script placeholders become `<script>` tags.

The client receives a complete HTML page with:
- Server-rendered content (zero JavaScript)
- A `<template>` element containing JSON data
- A mount `<div>` with the fallback content visible
- A `<script>` that loads the island bundle

### The bootstrap

When the bootstrap script executes:

1. It checks if the island bundle has already loaded (another island on the same page might have loaded it). If `window.__prestoIslands["my-chart"]` exists, it mounts immediately.

2. If not, it creates a `<script type="module">` element pointing to `/js/islands/my-chart.js` and appends it to `<head>`.

3. When the bundle loads, `defineIsland()` registers the island and immediately checks for `[data-island="my-chart"]` elements in the DOM. Finding the mount div, it reads the data bridge and calls `mount()`.

4. The mount function receives `{ data: [...] }` — the parsed JSON from the template element. It calls `createRoot(el).render(...)` with the data as React props. The chart appears.

The entire sequence — bundle load, registration, data read, mount — happens without polling, without `setTimeout`, without `requestAnimationFrame`. The `defineIsland()` function handles the timing.

### The data bridge

Two patterns, both supported by the same protocol:

**Pattern 1: Embedded JSON** (for data the server already has)

```html
<template id="island-data-my-chart"><htx:v raw>chartData | json</htx:v></template>
```

The server resolves the data during the pipeline and serializes it into a `<template>` element. The island reads it on mount. No fetch. No loading state. No cache management. The data crossed the bilateral boundary via the representation itself.

The `<template>` element is used instead of `<script type="application/json">` because Contract C1 (Document Model) states that `<script>` elements are opaque to the engine. The expression engine does not evaluate `htx:v` inside `<script>` tags. The `<template>` element is standard HTML that the engine processes normally and the browser does not render visibly.

**Pattern 2: Channel fetch** (for data the island fetches independently)

```html
<htx:grant type="channel" module="api" as="myToken" />
<input type="hidden" id="island-token-my-chart" value="{htx:myToken}" />
```

The server materializes a scoped channel token via `htx:grant`. The token is injected into a hidden input. The island reads `props.token` on mount and uses it as a Bearer token in fetch requests. The channel middleware validates the token before routing to the handler.

Both patterns are discovered automatically by `defineIsland()`. The mount function receives `props.data` (from the template element) and `props.token` (from the hidden input). The island uses whichever is present.

### The manifest

At boot time, the island module scans the bundle directory:

```
Islands: 2 registered (recharts-dashboard, react-query-posts)
```

The manifest maps island names to bundle paths and sizes. It's cached once and injected into the template context as `__islands`, available to any page that needs to reference island metadata.

---

## What This Means for the React Ecosystem

Any React npm package that can be rendered with `createRoot` can be mounted as a PRESTO island. The list is effectively the entire React component ecosystem:

| Package | Category | What It Does in the Island |
|---------|----------|---------------------------|
| Recharts / Victory / Nivo | Data visualization | Interactive charts with server-provided data |
| TipTap / ProseMirror | Rich text editing | Edits content the server rendered as static HTML |
| React Three Fiber | 3D rendering | Renders scenes in a bounded canvas region |
| Framer Motion | Animation | Animates elements within the island boundary |
| Stripe Elements | Payment forms | PCI-compliant card input in a scoped region |
| Monaco Editor | Code editing | Full IDE editor mounted into a div |
| React Map GL | Maps | Interactive maps with server-provided coordinates |
| cmdk / Downshift | Combobox | Accessible search interfaces |
| React PDF | Documents | PDF rendering in the browser |

Each one mounts with the same three-line pattern. The server provides the data. The island provides the interaction. The boundary between them is visible in the template.

---

## The Zero-Cost Guarantee

Pages that don't use islands pay nothing:

- No JavaScript loaded
- No bundle references in the HTML
- No mount divs in the DOM
- No bootstrap scripts injected
- The island module's context provider adds one cached object to the data context (negligible)

The cost is precisely per-island. A page with one Recharts island pays 840KB for that island. A page with zero islands pays zero. A page with both Recharts and React Query pays for both. The architecture is additive — you include what you need, per page, per feature.

---

## The Protocol in Full

```
Developer writes:
  1. islands/my-island.tsx    → defineIsland({ name, mount })
  2. bun build-islands         → my-island.js (bundled)
  3. template.htx              → <template> data bridge
                                  <htx:component src="/ui/island.htx" name="my-island">
                                    fallback content
                                  </htx:component>

Engine resolves:
  4. Stage 7:  island.htx expands → mount div + htx:script
  5. Stage 10: htx:data resolves → data in context
  6. Stage 15: <htx:v raw> evaluates → JSON in <template>
  7. Stage 20: htx:script injected → bootstrap before </body>
  8. Stage 22: placeholders → <script> tags

Client executes:
  9.  Bootstrap script runs
  10. Bundle loaded via <script type="module">
  11. defineIsland() registers + auto-discovers mount point
  12. readProps() reads <template> JSON and/or token <input>
  13. mount(el, props) called → React renders in bounded region

Result:
  - Complete HTML page (Layer 0 properties preserved)
  - React island mounted in bounded region (Layer 5 properties available)
  - Graceful degradation (slot content visible without JS)
  - Zero cost for non-island pages
```

---

## No Engine Modifications

The island interface composes entirely within the existing PRESTO architecture using three extension points:

1. **Context provider** (island module) — injects the manifest into template data
2. **htx:component** (island.htx) — renders the mount div and bootstrap script
3. **CLI** (build-islands command) — bundles the island source files

No new directives. No seed changes. No modifications to any of the 7 conformant engines. The 22-stage pipeline processes island pages identically to any other page — it sees `htx:component`, `htx:data`, `htx:v`, and `htx:script`, all of which are existing directives.

This is the architectural encapsulation principle expressed as a developer interface: the REST representation carries the bootstrapping instructions for the DO style within a bounded region, using the mechanisms the engine already provides. The protocol is convention, not extension. Any conformant htxlang engine that supports the existing 16 directives can serve pages with React islands.

---

## The Adoption Path

A React developer who wants to try PRESTO does not abandon their tools. They:

1. Pick one page in their application — a settings page, a content page, a form
2. Rewrite it as an `.htx` template at the surface (Layer 0)
3. Keep their React components for the features that genuinely need them — the dashboard chart, the rich text editor, the interactive map
4. Mount those components as islands in the `.htx` page

The React code doesn't change. The npm packages don't change. The developer's muscle memory for React components, hooks, and state doesn't change. What changes is that the settings page no longer ships 200KB of React for a page that is static text with three toggle switches. The content page no longer hydrates. The form no longer manages client-side state for a mutation the server can handle with a signed token.

The island interface makes this transition frictionless. Three lines in the template. One file for the island definition. One build command. The React package works exactly as documented. The surrounding page gains the properties of the surface.

The developer doesn't learn a new framework. They learn a new encapsulation. And the encapsulation gives them something no React-only architecture can provide: the properties of the surface for the parts of their application that were paying for depth they didn't need.
