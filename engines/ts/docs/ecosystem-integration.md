# The PRESTO Ecosystem Integration Model

## The Ecosystem Problem

Developers don't stay in React only because of the component model. They stay because of the ecosystem. Thousands of well-engineered packages — design systems, animation libraries, accessibility primitives, charting libraries, rich text editors, map integrations, payment form components, date pickers, data visualization tools. Telling developers to leave React means telling them to leave all of that behind. Nobody will do that.

The responsible approach does not ask them to.

---

## Three Categories

Everything in the React ecosystem falls into one of three categories. Each category requires a different response.

### Category 1: Architectural Bridging Technologies

These libraries address properties that the distributed objects architectural style — as described in Fielding's dissertation (Chapter 3, Section 3.6.3) — does not natively induce. This is not a criticism of React. React is a well-engineered implementation within the DO style. The DO style itself is what Fielding evaluated: it scores negatively on network performance, visibility, and reliability because its constraints do not induce those properties. The libraries below are rational engineering responses to the properties the DO style's constraints do not provide.

The issue is not that React chose the wrong architecture. It is that the DO style, when it operates as the outermost architecture, suppresses properties that REST induces natively. These libraries recover those properties from within the DO boundary — with skill and ingenuity — but at the cost of additional complexity, because the properties they seek are structural consequences of a different set of constraints.

| Library | Property It Seeks | Why the DO Style Doesn't Provide It |
|---------|------------------|-------------------------------------|
| Next.js SSR/SSG/ISR | Complete representations | The DO model renders on the client; the server sends a shell. SSR recovers the complete representation by rendering on both sides. |
| React Query / SWR | Server-authoritative data delivery | The DO model fetches data after mount. These libraries manage the client-side cache that exists because the data wasn't in the initial representation. |
| Redux / Zustand / Jotai | Shared state across isolated components | The DO model encapsulates state per component. These libraries provide coordination across the component tree that the model doesn't natively support. |
| React Hook Form | Declarative form state management | The DO model treats forms as components with state. These libraries recover the simplicity of HTML's native form model while remaining within React's rendering cycle. |
| React Router | URL-driven navigation | The DO model delegates rendering to the client. The client must manage its own URL mapping — a concern the server handles natively in REST. |
| NextAuth / Auth.js | Server-authoritative authentication | The DO model sends all application code to all users. Auth must be enforced after delivery. These libraries provide the session management that server-rendered architectures handle at the representation level. |
| Suspense / loading states | User feedback during asynchronous resolution | The DO model resolves data after the initial render. The user must wait. Suspense provides a declarative way to manage the waiting period that wouldn't exist if the data arrived with the page. |

**Response: Reorient the insight to its natural depth.**

Each of these technologies discovered something real about what developers need. They implemented the solution at Layer 5 because that was the only depth available to them within the DO style. The insight beneath each one is valid — it just belongs at a depth where the architectural constraints naturally induce the property being sought, rather than a depth where the property must be recovered through additional machinery.

The correct move is to identify the insight each technology surfaced, find the layer where that insight naturally lives, and provide the same developer experience at that depth.

| Technology | Insight It Discovered | Correct Depth | PRESTO Equivalent |
|-----------|----------------------|--------------|-------------------|
| Next.js SSR | Complete representations matter for performance, SEO, and accessibility | Layer 0 (the default) | The template IS the server-rendered page. No SSR configuration because no client rendering was surrendered. The insight (complete representations) is the baseline, not an optimization. |
| Next.js SSG / ISR | Some pages benefit from caching, and cache freshness is a real concern | Layer 0 + cache module | `Cache-Control` headers via the cache module. `stale-while-revalidate` for freshness. The insight (cacheable representations with controlled freshness) belongs to HTTP semantics, which predate React by two decades. The developer sets cache policy per route through module configuration. |
| React Query / SWR | Developers need declarative data management — declare what data you need, get it with caching and freshness guarantees | Layer 0 for initial data; Layer 4 for dynamic refresh | `htx:data` is the declarative data primitive. The developer declares `type`, `where`, `order`, `limit` — the engine resolves it. For client-side refresh, `channelFetch` with a granted token provides scoped data access. The insight (declarative data requirements) is preserved. The mechanism moves from client fetch + cache to server resolution + HTTP cache. |
| Redux / Zustand / Jotai | Applications need coordinated shared state that multiple UI regions can read and react to | Layer 0 for document state; Layer 2 for reactive client state | At the surface, the document IS the shared state — every element the server rendered is readable by any script. At Layer 2, the signal system (`signal()`, `computed()`, `effect()`) provides the reactive coordination Redux pioneered. The insight (reactive shared state) is preserved. The scope moves from a global client store to either the DOM or scoped signal graphs. |
| React Hook Form | Forms need declarative field registration, validation rules, and submission management | Layer 0 for form + mutation; Layer 2 for client validation | `htx:action` provides the mutation primitive (signed token, two-phase prepare/execute). Native HTML form attributes (`required`, `pattern`, `minlength`) provide declarative validation. For richer validation, a scoped script at Layer 2 validates on blur — the same DX as React Hook Form's `register()` with `rules`. The insight (declarative form management) is preserved. The mechanism moves from a React hook to native HTML attributes + an optional enhancement script. |
| React Router | Applications need URL-driven navigation with parameter extraction and nested layouts | Layer 0 (filesystem routing) | The file's path is the URL. `[param].htx` extracts parameters. `_layout.htx` provides nested layouts. The insight (URL-driven, file-organized, parameter-aware routing) is preserved. The mechanism moves from a client-side router to the filesystem itself. |
| NextAuth / Auth.js | Applications need turnkey authentication with session management and provider integration | Layer 0 (auth module) | The auth module provides HMAC-signed sessions, password hashing, and a context provider that makes `auth.user` available in every template. The insight (turnkey authentication with ambient availability) is preserved. The mechanism moves from a client-side provider to a server-side module that resolves auth state during template processing. |
| Suspense / Loading States | The user needs feedback when content is not yet available | Layer 0 (content is always available) | At the surface, the page arrives complete — the insight about user feedback is valid, but the condition (content unavailable) does not arise. For Layer 1+ features where a fetch occurs after page load, CSS-based indicators (`.htmx-indicator` or a simple class toggle) provide the same feedback. The insight (user feedback during transitions) is preserved. The triggering condition is narrowed from "every page load" to "specific dynamic interactions." |

The pattern: every technology in this list discovered a real developer need. That need doesn't vanish when the architecture changes. What changes is the depth at which the need is addressed. The developer who surfaces from Layer 5 doesn't lose declarative data management, reactive state, or form validation. They gain versions of these that operate at a shallower depth with fewer constraints, more induced properties, and less compensating machinery.

### Category 2: Genuine UI Capabilities

Libraries that provide interaction patterns the browser doesn't natively support well. These are real engineering achievements that happen to be packaged as React components. Their value is in what they do, not in their coupling to React's rendering model.

| Library | What It Provides |
|---------|-----------------|
| TipTap / ProseMirror | Rich text editing |
| Recharts / Victory / Nivo | Data visualization and charting |
| React Three Fiber / Drei | 3D rendering with Three.js |
| Framer Motion / React Spring | Physics-based animation |
| React DnD / dnd-kit | Complex drag-and-drop interactions |
| React Map GL / Leaflet | Map rendering and interaction |
| Stripe Elements | PCI-compliant payment forms |
| Monaco Editor | Code editing with IntelliSense |
| React PDF | PDF rendering in the browser |
| cmdk / Downshift | Accessible combobox and command palette |

**Response: Enclose them.** These are Layer 5 capabilities that belong in bounded regions of a Layer 0 representation. The server renders the complete page. A specific DOM region is allocated for the capability. The React component mounts into that region and operates within its boundary using the DO model's constraints. The REST properties hold at the outer boundary.

The developer uses the React ecosystem component exactly as documented — same API, same props, same behavior — but enclosed within a representation that provides the properties React cannot: complete initial HTML, server authority, cacheability, no hydration for the rest of the page.

### Category 3: Design Systems

Accessible, well-tested component primitive libraries that teams build products on.

| Library | What It Provides |
|---------|-----------------|
| Radix UI | Unstyled accessible primitives (dialog, popover, tabs, tooltip) |
| Headless UI | Tailwind-compatible accessible components |
| Shadcn/ui | Copy-to-project components built on Radix |
| Material UI / MUI | Google's Material Design system |
| Chakra UI | Styled accessible component library |
| Ant Design | Enterprise component system |

**Response: Extract the decisions.** A design system's value is the design decisions and the accessibility engineering. The React coupling is incidental. A Shadcn button doesn't need React to render — it needs the right CSS classes on a `<button>` element. A Radix dialog's accessibility pattern — focus trapping, escape to close, ARIA attributes — can be implemented in a 20-line scoped script without the React abstraction.

Extracting the decisions from the coupling produces server-rendered components that look identical, behave identically for accessibility, and operate at Layer 0 or Layer 2 instead of Layer 5.

---

## The Island Bridge

For Category 2 components — genuine UI capabilities that require React's rendering model — the integration mechanism is an island bridge. The template declares a bounded region where a React component will mount:

```html
<!-- A rich text editor enclosed in a Layer 0 representation -->
<htx:data type="post" where="slug = '{htx:params.slug}'" limit="1" as="items" />
<htx:each items="items" as="post">

  <h1>Edit: <htx:v>post.title</htx:v></h1>

  <!-- This div is the bounded region. Layer 5 operates here. -->
  <div id="editor-mount"
       data-content="{htx:post.body | json}"
       data-post-id="{htx:post.id}">
    <!-- Server renders a static preview while React loads -->
    <div class="editor-preview"><htx:v raw>post.body</htx:v></div>
  </div>

  <!-- The rest of the page is Layer 0. No React. -->
  <htx:component src="/ui/card.htx" title="Post Metadata">
    <p>Slug: <htx:v>post.slug</htx:v></p>
    <p>Status: <htx:v>post.status | capitalize</htx:v></p>
  </htx:component>

</htx:each>

<!-- Bootstrap the React island -->
<script type="module">
  import { createRoot } from 'react-dom/client';
  import { TiptapEditor } from '/js/islands/tiptap-editor.js';

  const mount = document.getElementById('editor-mount');
  const content = JSON.parse(mount.dataset.content);
  const postId = mount.dataset.postId;

  createRoot(mount).render(
    TiptapEditor({ content, postId, onSave: (html) => {
      // Save via channel API with granted token
    }})
  );
</script>
```

What happens here:

1. **The server resolves the page.** The post data comes from SQLite via `htx:data`. The metadata renders via expressions. The card component resolves at Layer 0. The page is complete HTML.
2. **A bounded region is prepared.** The `editor-mount` div contains server-rendered content (the post body as static HTML). If JavaScript fails to load, the user still sees the content.
3. **React mounts into the region.** The TipTap editor takes over the bounded div. It operates at Layer 5 within that region — virtual DOM, component state, rich interaction.
4. **The outer page remains at the surface.** The metadata card, the heading, the layout — all server-rendered HTML. No React. No hydration. No bundle for these elements.

The developer uses TipTap exactly as its documentation describes. The difference is that TipTap operates in a bounded region of a complete document rather than as the rendering engine for the entire page.

---

## The Orientation Holds

At every point in this model, the inverted layer orientation holds:

**The developer starts at their home depth.** If their home depth is Layer 2 (server-rendered templates with scoped scripts), most of their application lives there. The TipTap editor island is a dive to Layer 5 for a specific feature.

**The escape hatch goes up.** If the developer later builds a simpler editor that doesn't need TipTap's full capability — a markdown textarea with preview, for instance — they surface that feature to Layer 2 or even Layer 0. The island is removed. React is removed from that page. The page is lighter. The properties of the surface return.

**Compensations dissolve, capabilities enclose, decisions extract.** The developer doesn't replace React Query (it dissolves when data is server-resolved). They don't replace TipTap (it's enclosed in a bounded region). They don't replace Shadcn's visual design (the design tokens and CSS are extracted into server-rendered components).

---

## The Roadmap

### Near Term: Island Bridge

Any React ecosystem component can be mounted into a bounded region of a PRESTO representation. The developer brings their existing tools. The page is server-rendered. The island is client-rendered. Both coexist.

This is the adoption path. The developer doesn't learn a new ecosystem. They learn a new encapsulation — and they discover that the encapsulation provides properties (complete initial HTML, no hydration for the surrounding page, server authority over what islands exist) that their current architecture cannot.

### Medium Term: Native Layer 2 Alternatives

The most commonly used interaction patterns get PRESTO-native implementations as `htx:script` components operating at Layer 2:

- Accessible dialog (focus trap, ESC close, ARIA) — already built in presto-ui
- Accessible combobox / command palette — already built in presto-ui
- Tabs with keyboard navigation — already built in presto-ui
- Tooltip with hover/focus — already built in presto-ui
- Sortable data table — already built in cookbook
- Drag-and-drop — already demonstrated in cookbook

Each native alternative is shallower than its React equivalent. The developer can surface individual features from Layer 5 islands to Layer 2 components as the native alternatives mature. The transition is per-component, not per-application.

### Long Term: PRESTO-Native Design System

A complete design system that provides the same quality as Radix or Shadcn but operates at the surface by default:

- Design tokens as CSS custom properties (already in presto-ui)
- Accessible primitives as `.htx` components with scoped scripts (already started — 34 components)
- Visual consistency across Layer 0, Layer 2, and Layer 5 (same CSS classes regardless of depth)
- The developer uses the same design language whether a component is server-rendered HTML or a React island

The system grows from the surface upward. Layer 0 components first (pure HTML + CSS). Layer 2 enhancements where scripted behavior is needed. Layer 5 islands only for capabilities that genuinely require React's rendering model.

---

## The Principle

The React ecosystem is not the enemy. It is a body of engineering insights — some addressing real developer needs, some addressing problems the architecture created. Every technology in the ecosystem discovered something genuine. The responsible integration model respects each discovery and finds its correct depth:

- **Insights reorient.** Every "compensation" technology discovered a real need (declarative data, reactive state, form management, auth). That need is valid. It just belongs at a shallower depth. Reorient the insight to the layer where it lives natively.
- **Capabilities enclose.** Use them exactly as designed, in bounded regions of a surface-level representation. TipTap stays TipTap. It just mounts into a complete document instead of an empty shell.
- **Decisions extract.** The design system's value — the colors, the spacing, the accessibility patterns — survives the decoupling from React's rendering model.

The developer doesn't shed anything. They reorient. The insight from React Query (declarative data) becomes `htx:data`. The insight from Redux (reactive shared state) becomes signals. The insight from React Hook Form (declarative validation) becomes native HTML attributes plus a scoped script. The insight from Next.js SSR (complete representations) becomes the default.

Nothing is lost. Everything finds its depth.
