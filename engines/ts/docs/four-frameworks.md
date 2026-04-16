# Four Frameworks, One Representation

## What We Built

A single HTTP response containing five architectural styles rendering simultaneously:

- **PRESTO** (REST) — the surface bar, heading, and footer. Server-rendered HTML with live data from SQLite. Zero JavaScript. Complete when the response arrives.
- **Vue 3** (MVVM) — a reactive dashboard with computed filtering. The Composition API managing state. 93 KB.
- **Svelte-style** (Compiled Reactive) — a contact form with validation. Reactive primitives managing field state. 4 KB.
- **React + Three.js** (Distributed Objects + WebGL) — a 3D torus knot rotating in a WebGL canvas with orbit controls. The maximum distance from the surface. 1,390 KB.
- **Astro 6** (Static Compiled) — feature cards compiled at build time by the Astro compiler. Zero JavaScript. Served as static HTML in an iframe.

All enclosed within a single PRESTO representation. Each framework operates within its bounded region using its own constraints. The REST boundary holds at the HTTP level. The `defineIsland()` protocol handles the mount for each one.

**Live:** [demo.hypermediaapp.org/encapsulation/four-frameworks](https://demo.hypermediaapp.org/encapsulation/four-frameworks)

---

## Why This Matters

The web development industry has spent a decade debating which framework is correct. React versus Vue versus Svelte versus Astro versus htmx versus server-rendered templates. Each community argues that its constraints are the right ones. Each dismisses the others as making the wrong trade-offs.

The debate is wrong. Not because one framework is better, but because the question assumes you must choose one set of constraints for your entire application. You don't. The constraints live at different depths. Different features require different depths. The correct architecture encloses them all.

A Vue dashboard and a React 3D scene have nothing in common architecturally. Vue uses the MVVM pattern with reactive proxies. React uses the distributed objects pattern with a virtual DOM. Three.js uses WebGL shaders on the GPU. They share no rendering model, no state model, no update mechanism. In the current industry model, choosing one means abandoning the others — or building complex interop layers to make them coexist.

Under PRESTO's encapsulation, they coexist by default. Each mounts into a bounded div. Each operates using its own constraints within that div. The REST representation provides the boundary. The `defineIsland()` protocol provides the mount. No interop layer. No shared runtime. No framework war. Each framework does what it does best within the region where its constraints are correct.

---

## The Implementation

### Vue 3 Dashboard (93 KB)

```typescript
import { createApp, ref, computed } from "vue";
import { defineIsland } from "presto-ts/src/islands/define";

defineIsland({
  name: "vue-dashboard",
  mount(el, props) {
    const app = createApp(/* Vue component with Composition API */);
    app.mount(el);
  },
  unmount(el) {
    el.__vueApp?.unmount();
  },
});
```

The Vue dashboard receives posts from the server via the data bridge (`<template id="island-data-vue-dashboard">`). It creates reactive refs, computed properties for filtering, and renders a stat panel with filter buttons. The Composition API works exactly as documented. Vue's reactivity system — proxy-based, fine-grained, synchronous — operates within its bounded region.

The 93 KB bundle includes the Vue 3 runtime. No other island pays for it. Pages without the Vue dashboard load zero KB of Vue.

### Svelte-style Form (4 KB)

```typescript
import { defineIsland } from "presto-ts/src/islands/define";

// Minimal reactive system inspired by Svelte's runes
function reactive(initial) {
  let value = initial;
  const subs = [];
  return {
    get: () => value,
    set: (v) => { value = v; subs.forEach(fn => fn(v)); },
    subscribe: (fn) => { subs.push(fn); fn(value); },
  };
}

defineIsland({
  name: "svelte-form",
  mount(el, props) {
    // Creates reactive state, renders form, binds events
    createForm(el, props.token);
  },
});
```

Since Svelte 5 requires a compiler step that doesn't integrate with `createRoot`-style mounting, we built a Svelte-inspired form using the same reactive primitive pattern Svelte pioneered: observable values with subscriptions. The form has three validated fields, error display, and a submission flow.

The 4 KB bundle is the smallest island — it carries no framework runtime because the reactive primitives are 30 lines of code. This demonstrates that the island interface doesn't require React. Any code that can mount into a DOM element works.

### React Three Fiber 3D Scene (1,390 KB)

```typescript
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, MeshDistortMaterial } from "@react-three/drei";
import { defineIsland } from "presto-ts/src/islands/define";

defineIsland({
  name: "three-scene",
  mount(el, props) {
    createRoot(el).render(
      <Canvas camera={{ position: [0, 0, 4] }}>
        <RotatingTorus />
        <OrbitControls />
      </Canvas>
    );
  },
});
```

React Three Fiber wraps Three.js in React's component model. The scene contains a torus knot with distortion material, point lighting, and orbit controls. The GPU renders at 60fps. This is the maximum distance from the surface — binary computation in a client sandbox.

The 1,390 KB bundle includes React, ReactDOM, Three.js, and the Drei helper library. It is the most expensive island. It pays for WebGL. The Vue dashboard next to it does not carry this cost. The Svelte form does not carry this cost. Each island pays only for what it needs.

### Astro 6 Static Content (0 KB JS)

```astro
---
const features = [
  { name: "Zero JS by default", desc: "..." },
  { name: "Component islands", desc: "..." },
];
---
<html>
  {features.map(f => <div class="feature"><h3>{f.name}</h3><p>{f.desc}</p></div>)}
</html>
```

Astro compiled this page at build time (`npx astro build`). The output is static HTML — 2.3 KB, zero JavaScript. It is served in an iframe within the PRESTO page. Astro's compiler ran once. The output is cached forever. No runtime. No hydration. No framework code shipped to the client.

The iframe is the simplest encapsulation mechanism: a separate document within the page. The PRESTO representation carries the iframe reference. The browser handles the boundary. The Astro content is visible, accessible, and indexable within the iframe.

---

## The Data Flow

Each framework receives its data differently, but all data originates from the same source: the PRESTO engine's pipeline.

| Framework | Data Source | Mechanism |
|-----------|-----------|-----------|
| PRESTO surface | SQLite via `htx:data` | Resolved at Stage 10, rendered at Stage 15 |
| Vue dashboard | SQLite via `htx:data` → JSON | `<template>` data bridge, parsed on mount |
| Svelte form | None (user input) | Reactive state created on mount |
| React Three Fiber | None (scene is declarative) | Component props defined in JSX |
| Astro | Hardcoded at build time | Astro frontmatter, compiled to HTML |

The Vue dashboard and the PRESTO surface show the same posts from the same database. The PRESTO surface displays them as server-rendered text. Vue displays them as a reactive, filterable dashboard. Same data, different depths, different capabilities, both correct.

---

## The Numbers

| Framework | Bundle | JS Shipped | Rendering Model | Depth |
|-----------|--------|-----------|----------------|-------|
| PRESTO | 0 KB | 0 KB | Server pipeline | Surface |
| Vue 3 | 93 KB | 93 KB | MVVM + Reactive Proxy | Layer 5 |
| Svelte-style | 4 KB | 4 KB | Compiled Reactive | Layer 2 |
| React + Three.js | 1,390 KB | 1,390 KB | DO + Virtual DOM + WebGL | Layer 5/6 |
| Astro | 0 KB | 0 KB | Static compilation | Layer 0 |
| **Total** | | **1,487 KB** | | |

1,487 KB of JavaScript across three islands. But: the Vue dashboard is 93 KB. A page that uses only Vue pays 93 KB. A page that uses only the Svelte form pays 4 KB. A page that uses neither pays zero. The cost is per-island, per-page, per-feature.

---

## The Architectural Observation

Five different rendering models coexist in one HTTP response:

1. **Server pipeline resolution** (PRESTO) — 22-stage pipeline resolves directives into HTML at request time
2. **Reactive proxy observation** (Vue) — Composition API refs trigger computed re-evaluation and DOM patches
3. **Compiled reactive subscriptions** (Svelte-style) — State changes trigger subscriber callbacks that mutate DOM directly
4. **Virtual DOM reconciliation** (React) — Component tree diffed against previous tree, minimal DOM patches applied
5. **Static compilation** (Astro) — Source compiled to HTML at build time, served as immutable file

None of these models is aware of the others. Vue doesn't know React exists. React doesn't know Astro exists. The PRESTO engine doesn't know any of them exist — it resolved its directives and emitted HTML. The `<script>` tags that bootstrap the islands are opaque to the engine (Contract C1). The frameworks activate after the engine's work is done.

This is the bilateral boundary operating across four different client-side architectures simultaneously. The server resolved its half. Each client framework discovers its half. Neither side comprehends the other. The representation is the only thing they share — and the representation is complete, self-describing, and standard HTML.

---

## What This Means for the Industry

The framework debate ends. Not because one framework won, but because the question was wrong.

The question was: "Which framework should I use?" The answer was always: "For which feature?" A dashboard with reactive filtering is a Vue problem. A 3D visualization is a Three.js problem. A contact form with validation might be 4 KB of reactive primitives — no framework needed. A content page is an Astro problem, or a PRESTO problem, or just an HTML problem.

The REST representation doesn't care. It carries all of them. The server resolved its data, composed its templates, and emitted a complete document. The client-side frameworks mount into their respective regions and operate using their respective constraints. The surface provides the properties they cannot. The depth provides the capabilities the surface cannot.

This is the completing proof of Section 4.9.5: any client-side architectural style can be encapsulated within a REST representation, provided the server renders a complete document that includes the bounded region and bootstrapping instructions. The `defineIsland()` protocol is the mechanism. The four frameworks on this page are the evidence.

The representation is the universal carrier. The bilateral boundary is the universal separator. The constraints of each depth hold within their respective regions. The properties of the surface hold at the HTTP boundary.

Four frameworks. One representation. One protocol. One principle: the REST boundary encloses everything, and everything finds its depth.

**All demonstrations live at:**

- **Four Frameworks:** [demo.hypermediaapp.org/encapsulation/four-frameworks](https://demo.hypermediaapp.org/encapsulation/four-frameworks)
- **React + Astro Split:** [demo.hypermediaapp.org/encapsulation/splitscreen](https://demo.hypermediaapp.org/encapsulation/splitscreen)
- **Full React SPA:** [demo.hypermediaapp.org/encapsulation/full-spa](https://demo.hypermediaapp.org/encapsulation/full-spa)
- **7-Island Showcase:** [demo.hypermediaapp.org/encapsulation/showcase](https://demo.hypermediaapp.org/encapsulation/showcase)
- **React Query Proof:** [demo.hypermediaapp.org/encapsulation/react-query](https://demo.hypermediaapp.org/encapsulation/react-query)
- **Recharts Proof:** [demo.hypermediaapp.org/encapsulation/recharts](https://demo.hypermediaapp.org/encapsulation/recharts)
- **Complete Showcase:** [demo.hypermediaapp.org/showcase](https://demo.hypermediaapp.org/showcase)
