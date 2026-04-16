# Encapsulation Proofs: The Distributed Objects Architecture Inside REST

## What We Proved

We took two real npm packages from the React ecosystem — React Query and Recharts — and ran them, unmodified, inside bounded regions of PRESTO representations. The surrounding pages are Layer 0: server-rendered HTML, zero JavaScript, complete when they arrive. The React islands operate at Layer 5 within their bounded regions, using the full distributed objects model: components, state, effects, virtual DOM.

Both coexist in the same HTTP response. The REST properties hold at the outer boundary. The DO properties hold within the islands. Neither compromises the other.

This is the empirical validation of Section 4.9 of the white paper: Architectural Encapsulation — Inner Styles Within the RESTful Boundary.

---

## Proof 1: React Query (Category 1 — Bridging Technology)

### What React Query Is

React Query (@tanstack/react-query) is the most widely used server-state management library in the React ecosystem. It provides declarative data fetching with caching, background refetching, stale-while-revalidate semantics, and automatic retry. It exists because the distributed objects architecture renders on the client, which means data must be fetched after the page loads. React Query manages the complexity of that client-side data lifecycle.

In Fielding's terms: React Query seeks the property of server-authoritative data delivery. The DO style does not induce this property because its constraints place rendering authority on the client. React Query recovers the property through a client-side cache that mirrors server state.

### The Implementation

**Page:** `/encapsulation/react-query`

The page has two panels showing the same posts from the same SQLite database.

**Left panel (Layer 0):** The engine resolves `<htx:data type="post" where="status = 'published'" order="id desc" limit="10" as="surfacePosts" />` during the 22-stage pipeline. The results are iterated via `htx:each` and rendered as HTML. Zero JavaScript. The data arrived with the page. There is no loading state because there is nothing to wait for.

**Right panel (Layer 5):** React 19 mounts into a `<div id="react-island">`. React Query's `useQuery` hook fetches from `/api/channel/builder/posts` using a Bearer token that the server materialized via `<htx:grant type="channel" module="builder" as="islandToken" />`. The component manages filter state (all/published/draft), loading state ("Loading posts..."), error state, and a refetch button. This is the full React Query developer experience.

### The Data Flow

```
Server:
  1. htx:data queries SQLite → posts array in data context
  2. htx:each renders posts as HTML (Layer 0 panel)
  3. htx:grant signs a channel token (HMAC-SHA256, 120s TTL)
  4. Token is injected into a hidden input via {htx:islandToken}

Client:
  5. React bundle (440KB) loads and mounts into #react-island
  6. useQuery fires a fetch to /api/channel/builder/posts
  7. The channel middleware validates the Bearer token
  8. The builder module's channel handler queries the same SQLite database
  9. JSON is returned → React Query caches it → component renders
```

Steps 1-4 happen during the 22-stage pipeline on the server. Steps 5-9 happen on the client after the complete HTML has arrived and been painted. The Layer 0 panel is visible and interactive (links work) before step 5 begins.

### The Token Bridge

The channel token is the mechanism by which the REST representation authorizes the DO island to access server data. The server decided — at resolution time, based on the request context — that this page should receive a token scoped to `channel:builder`. The token is HMAC-SHA256 signed, has a 120-second TTL, and includes the user identity in the `sub` field.

The React island reads the token from the DOM (a hidden input) and includes it as a Bearer token in its fetch requests. The channel middleware validates the signature, checks expiry, and verifies the scope matches the requested module. If any check fails, the request returns 401 or 403.

This is the grant system from Contract C3 operating across the bilateral boundary. The server granted a capability. The client exercises it within the bounded region. The capability is scoped, signed, time-limited, and revocable.

### What the Proof Demonstrates

1. **React Query functions correctly inside a PRESTO representation.** The same useQuery hook, the same QueryClientProvider, the same cache semantics. No modifications to the library.

2. **The Layer 0 content is unaffected.** The left panel has zero JavaScript. It is cacheable (ETag header present). It works without a browser JavaScript engine. The existence of the React island does not compromise these properties.

3. **The data is the same.** Both panels query the same SQLite table. The Layer 0 panel resolves it at pipeline time. The React island fetches it via the channel API. The results are identical.

4. **The escape hatch is operational.** Remove the `<script>` tags that load React. The left panel still works. The data is still in the HTML. The page degrades gracefully — not because graceful degradation was engineered, but because the Layer 0 content was always complete.

### The Escape Hatch

React Query is a Category 1 technology — it seeks a property (server-authoritative data delivery) that Layer 0 provides natively via `htx:data`. The escape hatch is visible: the left panel IS the escape. The developer who sees both panels side by side can ask: "Does this feature need client-side filtering and refetch?" If yes, keep the island. If no, the left panel is the entire implementation. React Query dissolves — not because it's bad, but because the property it seeks is already present at the surface.

---

## Proof 2: Recharts (Category 2 — Genuine UI Capability)

### What Recharts Is

Recharts is a data visualization library built on React and D3. It renders interactive SVG charts — bar charts, pie charts, line charts — with tooltips, legends, animations, and responsive containers. It exists because HTML cannot natively render interactive data visualizations. This is not a bridging technology. It is a genuine UI capability that requires client-side rendering.

In Fielding's terms: Recharts provides a property (interactive visual data representation) that no depth shallower than Layer 5 can induce. The browser's native HTML can display text, tables, and images. It cannot render an interactive SVG chart with tooltip hover states, animated transitions, and dynamic view switching. This requires the DOM manipulation capabilities of a client-side rendering engine.

### The Implementation

**Page:** `/encapsulation/recharts`

The page has a left column of Layer 0 panels and a right panel with a Recharts dashboard.

**Left panels (Layer 0):**
- Post stats: Total posts (12), Published (10), Drafts (2). Computed by the engine's `length` pipe.
- Task stats: Total tasks (9), To Do (4), In Progress (2), Done (3). Same computation.
- Recent posts: A scrollable list of all 12 posts with title and status badge.

All three panels are zero JavaScript. The counts are computed server-side. The data is in the HTML.

**Right panel (Layer 5):** React 19 + Recharts 3 mount into `<div id="recharts-island">`. The dashboard offers three chart views via a toggle:
- **Bar chart:** Tasks by status (color-coded bars) and tasks by priority (horizontal bars).
- **Pie chart:** Post status distribution and task status distribution side by side.
- **Line chart:** Post metrics (title length and content score) across all posts.

All charts have interactive tooltips, legends, and responsive containers.

### The Data Bridge

Unlike the React Query proof, the Recharts island does not fetch data from an API. Instead, the server serializes the data into the representation itself:

```html
<template id="posts-data">[{"id":12,"slug":"unpublished-notes",...},...]</template>
<template id="tasks-data">[{"id":1,"title":"Design homepage",...},...]</template>
```

The engine resolves `<htx:data type="post" order="id desc" limit="50" as="allPosts" />` during pipeline stage 10. The `<htx:v raw>allPosts | json</htx:v>` expression serializes the result as JSON inside a `<template>` element. The React island reads this data on mount:

```javascript
var postsJson = document.getElementById('posts-data')?.content?.textContent || '[]';
var tasksJson = document.getElementById('tasks-data')?.content?.textContent || '[]';
window.__mountRechartsIsland('recharts-island', postsJson, tasksJson);
```

This is the data bridge pattern: the server resolves the data, serializes it into the representation, and the client-side island reads it from the DOM. No fetch. No API call. No loading state. No cache management. The data crossed the bilateral boundary via the representation itself — which is exactly what REST prescribes.

### Why `<template>` Instead of `<script type="application/json">`

Contract C1 states: "`<script>` elements are opaque to the engine." The expression engine does not evaluate `htx:v` inside `<script>` tags — this is the bilateral boundary. The `<template>` element is standard HTML that the engine processes normally, and the browser does not render its contents visibly. It serves as a data container that both the engine and the client can access.

### What the Proof Demonstrates

1. **Recharts functions correctly inside a PRESTO representation.** The same BarChart, PieChart, LineChart components. The same ResponsiveContainer, Tooltip, Legend. The same interactive SVG rendering. No modifications to the library.

2. **The Layer 0 panels display the same data as text.** The stats (12 posts, 9 tasks, status counts) are computed by the engine. The post list is server-rendered. Both are zero JavaScript. A user without JavaScript sees all the data — just not as charts.

3. **The data bridge eliminates the fetch cycle.** The React island does not fetch. It reads data that the server already resolved and serialized into the HTML. There is no loading state for the charts because the data is present when React mounts. This is possible because the outer REST architecture provides complete representations — the data is in the document.

4. **The 840KB bundle pays only for the chart.** In a React application, the entire page would be at Layer 5 — stats, list, charts, layout. All 840KB would be required for everything. Under encapsulation, the 840KB pays for the interactive visualization. The stats are free. The list is free. The layout is free.

5. **There is no escape hatch for the chart — and that's correct.** Unlike React Query, Recharts is not seeking a property the surface provides. Interactive SVG visualizations genuinely require Layer 5. The depth is correct. The encapsulation doesn't dissolve the chart; it ensures that everything else doesn't pay for the chart's depth.

### The Asymmetry Between the Two Proofs

| | React Query (Proof 1) | Recharts (Proof 2) |
|---|---|---|
| Category | 1 — Bridging technology | 2 — Genuine UI capability |
| Property sought | Server-authoritative data delivery | Interactive visual data representation |
| Surface provides it? | Yes (htx:data) | No (HTML cannot render interactive charts) |
| Escape hatch | Yes — remove the island, data is in the HTML | No — the chart requires Layer 5 |
| Correct depth | Layer 0 (the island is unnecessary for data display) | Layer 5 (the island is necessary for visualization) |
| What encapsulation provides | The proof that the island is optional | The proof that the surrounding page doesn't need the island's depth |

This asymmetry is the point. The architecture doesn't claim everything should be at the surface. It claims the surface should be the outer layer, and depth should be confined to bounded regions where it's genuinely required. Proof 1 shows a case where the depth is unnecessary. Proof 2 shows a case where the depth is correct. Both validate the encapsulation model.

---

## Implementation Details

### Bundle Process

Both islands are authored as `.tsx` files in `demo/islands/` and bundled with Bun's built-in bundler:

```bash
bun build demo/islands/react-query-posts.tsx --outdir demo/public/js/islands --minify
bun build demo/islands/recharts-dashboard.tsx --outdir demo/public/js/islands --minify
```

The bundler resolves all imports (React, ReactDOM, React Query, Recharts, D3 internals), tree-shakes unused code, and outputs a single minified JavaScript file per island. These files are served as static assets by the engine's static file handler.

| Island | Source | Bundle Size | Dependencies |
|--------|--------|-------------|-------------|
| React Query | react-query-posts.tsx | 440 KB | react, react-dom, @tanstack/react-query |
| Recharts | recharts-dashboard.tsx | 840 KB | react, react-dom, recharts (includes D3) |

### Mount Protocol

Each island exports a mount function to `window`:

```typescript
(window as any).__mountRechartsIsland = mount;
```

The page loads the bundle as a module, then calls the mount function with the target element ID and any server-provided data:

```html
<script type="module" src="/js/islands/recharts-dashboard.js"></script>
<script type="module">
  function tryMount() {
    if (window.__mountRechartsIsland) {
      var postsJson = document.getElementById('posts-data')?.content?.textContent || '[]';
      window.__mountRechartsIsland('recharts-island', postsJson, tasksJson);
    } else {
      setTimeout(tryMount, 50);
    }
  }
  tryMount();
</script>
```

The `tryMount` pattern handles the case where the bundle hasn't finished loading when the mount script executes. In production, the bundle could be loaded with `defer` or the mount could be triggered by the bundle's `load` event.

### Server-to-Island Data Transfer

Two patterns demonstrated:

**Pattern 1: Channel fetch (React Query proof).** The server issues a scoped channel token via `htx:grant`. The island reads the token from the DOM and uses it as a Bearer token in fetch requests to the channel API. The channel handler queries the database and returns JSON. This pattern is appropriate when the island needs to refresh data independently of page loads.

**Pattern 2: Embedded JSON (Recharts proof).** The server resolves the data via `htx:data`, serializes it as JSON into a `<template>` element via `<htx:v raw>data | json</htx:v>`, and the island reads the JSON from the DOM on mount. No network request. No loading state. This pattern is appropriate when the island operates on the same data the server already resolved — the data crosses the bilateral boundary via the representation itself.

Both patterns preserve the bilateral boundary. In Pattern 1, the data crosses via an authenticated channel. In Pattern 2, the data crosses via the representation. Neither pattern requires the island to access server resources directly. The server decides what data the island receives. The island operates on what it was given.

---

## Verification Results

### React Query Proof

```
✓ Page loads at 200 with all module headers
✓ Layer 0 panel: 10 published posts rendered as HTML, zero JS
✓ Channel token materialized (HMAC-SHA256, scoped to builder)
✓ React bundle served (440KB, 200 OK)
✓ Channel API returns 12 posts via authenticated endpoint
✓ ETag header present on the response (Layer 0 content is cacheable)
✓ X-Request-ID, CORS, security, rate-limit headers all present
```

### Recharts Proof

```
✓ Page loads at 200 with all module headers
✓ Layer 0 panels: 12 posts, 10 published, 2 drafts, 9 tasks — all computed server-side
✓ Post list: all 12 posts rendered as HTML, zero JS
✓ Data bridge: JSON arrays serialized into <template> elements
✓ Recharts bundle served (840KB, 200 OK)
✓ Both Layer 0 and Layer 5 content present in same response
```

### Encapsulation Invariants (Both Proofs)

```
✓ The Layer 0 content has zero JavaScript
✓ The Layer 0 content is cacheable (ETag present)
✓ The Layer 0 content works without a browser JavaScript engine
✓ The React island mounts into a bounded region without affecting surroundings
✓ All 12 module kit headers are present (the modules don't break under encapsulation)
✓ Removing the island script tags leaves the Layer 0 content fully functional
✓ The REST boundary (HTTP level) is not compromised by the DO island
```

---

## What This Means

The distributed objects architecture — as implemented by React, with its components, virtual DOM, state management, and rendering cycle — can be fully encapsulated within a RESTful representation. This is not a compatibility hack. It is the correct architectural relationship described in Fielding's dissertation: REST and DO are different architectural styles with different constraint-property trade-offs, and REST's complete-representation constraint means it can carry anything — including the bootstrapping instructions for an alternative style.

The practical consequence is that the React ecosystem is not left behind. A developer building a PRESTO application can use React Query for data-heavy interactive panels, Recharts for visualizations, TipTap for rich text editing, Framer Motion for animation, React Three Fiber for 3D, Stripe Elements for payments — any React component, any npm package, unmodified. The component mounts into a bounded region. The rest of the page is the surface.

The developer's choice is not "React or PRESTO." It is: "For this feature, on this page, is depth necessary?" If yes, the island provides it. If no, the surface provides everything the depth was compensating for, at zero cost.

The encapsulation holds. The properties of each depth hold within their respective regions. The REST boundary is preserved. The DO model operates within its grant. Both are correct at their depth.

This was the thesis of Section 4.9. It is now empirically demonstrated.
