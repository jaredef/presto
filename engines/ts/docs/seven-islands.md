# Seven React Packages, One Protocol, Zero Rewrites

We took seven npm packages from the React ecosystem — spanning rich text, maps, code editing, 3D rendering, drag-and-drop, data fetching, and charting — and mounted each one, unmodified, inside a server-rendered PRESTO page using the same three-step protocol.

No package was forked. No API was changed. No wrapper library was written. Each package works exactly as its documentation describes. The difference is what surrounds it.

---

## The Protocol

Every island follows the same steps:

**Step 1.** Write a definition file:

```typescript
import { defineIsland } from "presto-ts/src/islands/define";
import { createRoot } from "react-dom/client";
import { SomeReactComponent } from "some-npm-package";

defineIsland({
  name: "my-island",
  mount(el, props) {
    createRoot(el).render(<SomeReactComponent data={props.data} />);
  },
});
```

**Step 2.** Build it:

```bash
bun cli/index.ts build-islands islands public/js/islands
```

**Step 3.** Use it in a template:

```html
<template id="island-data-my-island"><htx:v raw>myData | json</htx:v></template>
<htx:component src="/ui/island.htx" name="my-island">
  <p>Loading...</p>
</htx:component>
```

That's it. The `defineIsland()` function handles registration and auto-mounting. The `island.htx` component handles the mount div, bootstrap script, and graceful degradation. The CLI handles bundling. The data bridge carries server-resolved data into the island via `<template>` elements.

The surrounding page is Layer 0: server-rendered HTML, zero JavaScript, complete when it arrives. The island mounts into a bounded region after the page is painted. If JavaScript is disabled or the bundle fails to load, the slot content (the `<p>Loading...</p>`) remains visible.

---

## The Seven Islands

### 1. TipTap — Rich Text Editing

**Package:** @tiptap/react + @tiptap/starter-kit + ProseMirror
**Bundle:** 763 KB
**Domain:** Rich text
**Data bridge:** Post content from SQLite serialized as JSON

The server renders the post body as static HTML in the Layer 0 portion of the page. The TipTap island provides editing: bold, italic, strikethrough, code, headings, bullet lists, ordered lists, blockquotes, horizontal rules, undo, redo. A full toolbar. ProseMirror's document model underneath.

This is the canonical "you need a framework for this" use case. HTML's `contenteditable` is insufficient for production rich text. TipTap provides what the surface cannot. The island is the correct depth for this feature.

The definition file is 70 lines. The template usage is 3 lines. The same TipTap API. The same ProseMirror foundation. Nothing changed about the React code.

**Live:** [demo.hypermediaapp.org/encapsulation/showcase](https://demo.hypermediaapp.org/encapsulation/showcase) (section 1)

---

### 2. Leaflet — Interactive Maps

**Package:** react-leaflet + Leaflet
**Bundle:** 538 KB
**Domain:** Geospatial visualization
**Data bridge:** Coordinates and markers as JSON (hardcoded in this demo; in production, from htx:data)

The server provides four Bay Area locations as JSON in a `<template>` element. The Leaflet island renders an interactive map with OpenStreetMap tiles, markers at each location, and popups on click. The user can drag, zoom, and interact with the map.

Geospatial rendering with tile layers, markers, and popups cannot exist at the surface. The browser cannot render an interactive map without JavaScript. The island is the correct depth.

**Live:** [demo.hypermediaapp.org/encapsulation/showcase](https://demo.hypermediaapp.org/encapsulation/showcase) (section 2)

---

### 3. CodeMirror — Code Editor

**Package:** @uiw/react-codemirror + @codemirror/lang-javascript
**Bundle:** 894 KB
**Domain:** Code editing
**Data bridge:** Source code and language as JSON

The server provides a TypeScript code sample — the `defineIsland()` API itself — as JSON in a `<template>` element. The CodeMirror island renders a full code editor with syntax highlighting, line numbers, a dark theme, and a copy button. The user can edit the code, and the line count updates in real time.

A code editor with syntax highlighting, bracket matching, and intelligent editing requires a complex text rendering engine that HTML's `<textarea>` cannot provide. The island is the correct depth.

**Live:** [demo.hypermediaapp.org/encapsulation/showcase](https://demo.hypermediaapp.org/encapsulation/showcase) (section 3)

---

### 4. React Three Fiber — 3D Scene

**Package:** @react-three/fiber + @react-three/drei + Three.js
**Bundle:** 1,390 KB
**Domain:** 3D / WebGL
**Data bridge:** None (scene defined in the component)

A rotating torus knot with distortion material, ambient and point lighting, and orbit controls. The user can drag to orbit the camera around the object. The scene renders at 60fps using WebGL shaders on the GPU.

This is the maximum distance from the surface. Binary GPU computation in the browser sandbox. No amount of server rendering can produce an interactive 3D scene. The island is the correct depth — and the bundle (1,390 KB) is the cost of that depth. It pays for the 3D. The surrounding page is free.

**Live:** [demo.hypermediaapp.org/encapsulation/showcase](https://demo.hypermediaapp.org/encapsulation/showcase) (section 4)

---

### 5. dnd-kit — Sortable List

**Package:** @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities
**Bundle:** 429 KB
**Domain:** Drag and drop
**Data bridge:** Tasks from SQLite serialized as JSON

The server resolves 9 tasks from SQLite via `htx:data` and serializes them into a `<template>` element. The dnd-kit island renders a sortable list where the user can drag items to reorder them. The drag interaction includes smooth animations, a shadow effect during drag, and position tracking.

The browser's native HTML5 Drag and Drop API handles basic drag operations (as demonstrated in the cookbook's kanban board at Layer 2). But the native API cannot produce smooth positional animations, collision detection, or the keyboard-accessible reordering that dnd-kit provides. For applications that need this level of polish, the island is the correct depth.

**Live:** [demo.hypermediaapp.org/encapsulation/showcase](https://demo.hypermediaapp.org/encapsulation/showcase) (section 5)

---

### 6. React Query — Data Fetching

**Package:** @tanstack/react-query
**Bundle:** 427 KB
**Domain:** Server state management
**Data bridge:** Channel token (Bearer auth for fetch)

The island fetches posts from `/api/channel/builder/posts` using a server-materialized channel token. Filter state, loading state, error handling, and a refetch button — the full React Query developer experience.

This is the Category 1 proof: a bridging technology that seeks server-authoritative data delivery. The escape hatch is the Layer 0 panel next to it, which shows the same data resolved server-side via `htx:data`. React Query dissolves when the developer surfaces this concern.

**Live:** [demo.hypermediaapp.org/encapsulation/react-query](https://demo.hypermediaapp.org/encapsulation/react-query)

---

### 7. Recharts — Data Visualization

**Package:** recharts (includes D3)
**Bundle:** 816 KB
**Domain:** Charting
**Data bridge:** Posts and tasks from SQLite serialized as JSON

Bar charts, pie charts, and line charts with tooltips, legends, and view switching. The same data that the Layer 0 stat panels display as text, the Recharts island visualizes as interactive SVG.

This is the Category 2 proof: a genuine UI capability. Interactive SVG charts with tooltips and animations cannot exist at the surface. The depth is correct. The encapsulation ensures everything else doesn't pay for the chart's depth.

**Live:** [demo.hypermediaapp.org/encapsulation/recharts](https://demo.hypermediaapp.org/encapsulation/recharts)

---

## The Numbers

| Island | Package | Domain | Bundle | Data Bridge |
|--------|---------|--------|--------|-------------|
| tiptap-editor | @tiptap/react | Rich text | 763 KB | Embedded JSON |
| leaflet-map | react-leaflet | Maps | 538 KB | Embedded JSON |
| codemirror-editor | @uiw/react-codemirror | Code editing | 894 KB | Embedded JSON |
| three-scene | @react-three/fiber | 3D / WebGL | 1,390 KB | None |
| dndkit-sortable | @dnd-kit/sortable | Drag & drop | 429 KB | Embedded JSON |
| react-query-posts | @tanstack/react-query | Data fetching | 427 KB | Channel token |
| recharts-dashboard | recharts | Charting | 816 KB | Embedded JSON |

Total: 7 islands, 7 npm packages, 5,257 KB of bundles across all islands.

But no page loads all seven. The showcase page loads five (4,014 KB). The React Query proof loads one (427 KB). The Recharts proof loads one (816 KB). A page with no islands loads zero. The cost is precisely per-island, per-page.

---

## What Didn't Change

- **No package was forked.** Every import is from the published npm package, unmodified.
- **No API was wrapped.** TipTap's `useEditor`, Leaflet's `MapContainer`, CodeMirror's `CodeMirror` component, Three Fiber's `Canvas`, dnd-kit's `DndContext` — all used exactly as documented.
- **No build system was replaced.** Bun's built-in bundler handles the compilation. No webpack config. No Vite config. No babel plugins.
- **No engine was modified.** The island interface composes entirely within the existing 22-stage pipeline using `htx:component`, `htx:data`, `htx:v`, and `htx:script` — all existing directives. Any conformant htxlang engine can serve these pages.

---

## What Did Change

The pages these islands live on are server-rendered HTML. Complete when they arrive. Cacheable by any intermediary. Accessible without JavaScript. The islands mount into bounded regions after the page is painted. The REST properties hold at the HTTP boundary. The DO properties hold within each island.

A page that needs a rich text editor pays 763 KB for TipTap. It does not pay for React Router, Redux, React Query, or any other bridging technology — because the page's data was resolved by the server, the page's routing is the filesystem, and the page's state is the DOM. The editor island is the only JavaScript on the page.

A page that needs an interactive map and a sortable list pays 538 KB + 429 KB = 967 KB for those two islands. The heading, the sidebar, the navigation, the footer, the data tables — all server-rendered HTML. Zero JavaScript. The islands are the only depth on the page.

A page that needs nothing — a blog post, a settings form, a documentation article — pays nothing. Zero KB. No bundle. No React. No framework runtime. The page is HTML, and HTML is enough.

---

## The Adoption Path

A React developer who wants to try this does not abandon their tools. They:

1. Pick one page that currently renders entirely with React
2. Identify which parts of that page genuinely need React (the chart, the editor, the map)
3. Rewrite the rest as an `.htx` template at the surface
4. Mount the React parts as islands using `defineIsland()`

The React code doesn't change. The npm packages don't change. The developer's muscle memory for hooks and components doesn't change. What changes is that the blog post page no longer ships 200 KB of React for static text. The settings form no longer hydrates. The documentation page no longer loads a JavaScript bundle.

The island interface makes this transition frictionless. One SDK function. One build command. Three lines in the template. Any React package. Any interaction domain. One protocol.

---

## Live Demonstrations

All islands are running on a Raspberry Pi via Cloudflare Tunnel:

- **Island Showcase (all 5 new islands):** [demo.hypermediaapp.org/encapsulation/showcase](https://demo.hypermediaapp.org/encapsulation/showcase)
- **React Query proof (bridging technology):** [demo.hypermediaapp.org/encapsulation/react-query](https://demo.hypermediaapp.org/encapsulation/react-query)
- **Recharts proof (genuine capability):** [demo.hypermediaapp.org/encapsulation/recharts](https://demo.hypermediaapp.org/encapsulation/recharts)
- **Cookbook (11 features at correct depth):** [demo.hypermediaapp.org/cookbook](https://demo.hypermediaapp.org/cookbook)
- **Layer 5 First (escape hatches):** [demo.hypermediaapp.org/layer5](https://demo.hypermediaapp.org/layer5)
- **Reorientation guide:** [demo.hypermediaapp.org/reorientation](https://demo.hypermediaapp.org/reorientation)

View the source of any page. The server-rendered content is HTML. The islands mount into bounded divs. The bilateral boundary is visible in the markup. The encapsulation holds.

Seven packages. One protocol. Zero rewrites. The React ecosystem is not left behind. It is enclosed — bounded, granted, and mediated by the representation that carried it into existence on the client.
