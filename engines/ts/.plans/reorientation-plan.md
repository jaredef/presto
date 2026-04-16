# Reorientation Plan: React Ecosystem → Correct PRESTO Layer

**Status:** PLANNED
**Date:** 2026-04-05

## Objective

For every major compensating technology in the React ecosystem, demonstrate that the property it recovers exists natively at the correct PRESTO layer. Build concrete, runnable examples. Produce a migration guide that shows React developers the path from each compensating mechanism to the layer where the property is available by default.

## Structure

Each reorientation has three deliverables:
1. **Working example** — a page in the demo app exercising the correct layer
2. **Side-by-side comparison** — React code vs PRESTO code for the same feature
3. **Migration guide entry** — prose explaining the reorientation

## Phases

### Phase 1: Rendering Reorientation
Dissolves: SSR, SSG, ISR, Streaming SSR, React Server Components

### Phase 2: Hydration Dissolution  
Dissolves: hydrate/hydrateRoot, selective hydration, resumability (Qwik)

### Phase 3: Routing Reorientation
Dissolves: React Router, Next.js App Router, file-based routing with client nav

### Phase 4: State Management Reorientation
Dissolves: Redux/Zustand/Jotai, React Query/SWR, Context API/Provider Hell

### Phase 5: Data Fetching Reorientation
Dissolves: getServerSideProps, getStaticProps, Server Actions, API Routes, tRPC

### Phase 6: Build Tooling Dissolution
Dissolves: webpack/Vite/turbopack, Babel/SWC, tree shaking

### Phase 7: Performance Reorientation
Dissolves: code splitting, Suspense boundaries, image optimization

### Phase 8: Security Reorientation
Dissolves: API middleware auth, route guards, "use server"/tainted data

### Phase 9: Migration Guide Assembly
Compile all side-by-side comparisons into a comprehensive "From React to PRESTO" guide

---

## Phase 1: Rendering Reorientation

### 1.1 SSR → Layer 0 (Default)
**React pattern:**
```jsx
// pages/posts.tsx (Next.js)
export async function getServerSideProps() {
  const posts = await db.query('SELECT * FROM posts WHERE status = "published"');
  return { props: { posts } };
}
export default function Posts({ posts }) {
  return <div>{posts.map(p => <Card key={p.id} title={p.title}>{p.body}</Card>)}</div>;
}
```

**PRESTO equivalent:**
```html
<!-- pages/posts.htx -->
<htx:data type="post" where="status = 'published'" order="id desc" as="posts" />
<htx:each items="posts" as="post">
  <htx:component src="/ui/card.htx" title="{htx:post.title}">
    <p><htx:v>post.body</htx:v></p>
  </htx:component>
</htx:each>
```

**Demo page:** `/reorientation/ssr` — shows the same page, server-rendered by default. No SSR configuration. The template IS the SSR.

### 1.2 SSG → Layer 0 + Cache-Control
**React pattern:** `getStaticProps` + build step + deploy
**PRESTO equivalent:** Same template + `Cache-Control: public, max-age=3600` header (via cache module)

**Demo page:** `/reorientation/ssg` — same template, cache module adds headers. Show response headers.

### 1.3 ISR → Layer 0 + HTTP Cache Semantics
**React pattern:** `revalidate: 60` in getStaticProps
**PRESTO equivalent:** `Cache-Control: public, max-age=60, stale-while-revalidate=300` — standard HTTP, predates React by 20 years.

**Demo page:** `/reorientation/isr` — same template, standard cache headers. Show that CDN/proxy handles revalidation.

### 1.4 Streaming SSR → Layer 0 (Browser Progressive Rendering)
**React pattern:** `renderToPipeableStream` + Suspense boundaries + fallback UI
**PRESTO equivalent:** The browser renders HTML as it arrives. Chunked transfer encoding. No Suspense, no fallbacks.

**Demo page:** `/reorientation/streaming` — a page with multiple data queries. The engine resolves them in pipeline order. The browser paints as chunks arrive.

### 1.5 React Server Components → Layer 0 (Every Template Is a Server Component)
**React pattern:** `"use client"` / `"use server"` directives, serialization boundaries
**PRESTO equivalent:** Every `.htx` template has direct data access. No directive needed because there's no alternative.

**Demo page:** `/reorientation/rsc` — a template with data queries, expressions, components — all resolved server-side. No client/server boundary because the server resolves everything.

---

## Phase 2: Hydration Dissolution

### 2.1 Hydration → Does Not Exist
**React pattern:** `hydrateRoot(document.getElementById('root'), <App />)`
**PRESTO equivalent:** Nothing. The page is complete. Scripts enhance, they don't reclaim.

**Demo page:** `/reorientation/hydration` — an interactive page (dialog, tabs, slider) where scripts execute AFTER the complete document. No reconciliation. No mismatch possible.

### 2.2 Selective Hydration → Independent Script Execution
**React pattern:** React 18 prioritizes hydrating clicked components
**PRESTO equivalent:** Each `htx:script` is an independent IIFE. They execute independently by construction.

**Demo page:** `/reorientation/selective` — page with 5 interactive components. Each script is independent. Click any component — it works immediately because the script already ran.

### 2.3 Resumability → Latent Binding
**React pattern:** Qwik serializes state into HTML, resumes on interaction
**PRESTO equivalent:** The DOM IS the state. Scripts read from the DOM. No serialization needed.

**Demo page:** `/reorientation/resumability` — server renders data into data attributes. Script reads from DOM on load. No serialization framework. The document is the state.

---

## Phase 3: Routing Reorientation

### 3.1 Client-Side Router → Filesystem Routing (Layer 0)
**React pattern:** `<Route path="/blog/:slug" element={<BlogPost />} />`
**PRESTO equivalent:** File at `pages/blog/[slug].htx`. The filesystem IS the router.

**Demo page:** Already exists at `/blog/[slug]`. Document the zero-config routing.

### 3.2 Next.js File Conventions → Single File Per Route
**React pattern:** `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`
**PRESTO equivalent:** One `.htx` file handles all concerns. `_layout.htx` for layout. `_404.htx` for not found.

**Demo page:** `/reorientation/routing` — show the file tree. One file = one route = one concern.

### 3.3 Partial Updates → htmx (Layer 1)
**React pattern:** Client-side navigation avoids full page reload
**PRESTO equivalent:** htmx swaps HTML fragments. Server authority preserved. No client router.

**Demo page:** `/reorientation/partial` — a page with htmx-powered tabs that swap content without full reload.

---

## Phase 4: State Management Reorientation

### 4.1 Redux/Zustand → The Document IS the State (Layer 0)
**React pattern:** `const store = configureStore({ reducer: { posts: postsReducer } })`
**PRESTO equivalent:** The server rendered the data into the HTML. The document is the store.

**Demo page:** `/reorientation/state` — interactive page where scripts read state from the DOM. No store, no reducer, no actions.

### 4.2 React Query/SWR → htx:data + Channel Fetch (Layers 0/4)
**React pattern:** `const { data } = useQuery(['posts'], fetchPosts)`
**PRESTO equivalent:** `<htx:data type="post" as="posts" />` for initial data. `channelFetch` for dynamic refresh.

**Demo page:** `/reorientation/data-fetching` — initial data from htx:data. A "refresh" button uses channel fetch. No query client, no cache keys.

### 4.3 Context/Providers → Module Context Providers (Layer 0)
**React pattern:** Nested `<ThemeProvider><AuthProvider><QueryProvider>...`
**PRESTO equivalent:** Modules register context providers. Values available as `{htx:auth.user.name}`. No wrapping.

**Demo page:** `/reorientation/context` — show auth, theme, and config values all available via expressions. No provider components.

---

## Phase 5: Data Fetching Reorientation

### 5.1 getServerSideProps → htx:data (Layer 0)
**Demo page:** `/reorientation/gssp` — side-by-side: Next.js data function vs htx:data directive. Same result, no separation.

### 5.2 Server Actions → htx:action (Layer 0)
**React pattern:** `"use server"` function called from form
**PRESTO equivalent:** `<htx:action name="create" type="post" />` + hidden token in form. Standard POST.

**Demo page:** `/reorientation/server-actions` — form with signed mutation token. POST creates record. No RPC, no "use server".

### 5.3 API Routes/tRPC → Channel Handlers (Layer 4)
**React pattern:** `/api/posts` route handler or tRPC procedure
**PRESTO equivalent:** Module registers channel handler. Client uses `channelFetch` with Bearer token.

**Demo page:** `/reorientation/api` — channel handler serves JSON. Token-scoped access. No API route file.

---

## Phase 6: Build Tooling Dissolution

### 6.1 Bundlers → Nothing
**Demo page:** `/reorientation/build` — show that the demo app has no package.json dependencies (beyond bun), no webpack config, no vite config. The page loads instantly.

### 6.2 Transpilers → Standard JavaScript
**Demo page:** `/reorientation/transpile` — an htx:script block using standard JS. The code the developer writes is the code that runs. No JSX transform, no TypeScript compilation for templates.

### 6.3 Tree Shaking → Additive by Design
**Demo page:** `/reorientation/treeshake` — show three pages: one with zero JS (Layer 0), one with 3KB signals (Layer 2), one with channel grant (Layer 4). Each page sends exactly what it needs. Nothing to shake.

---

## Phase 7: Performance Reorientation

### 7.1 Code Splitting → Per-Page by Architecture
**Demo page:** `/reorientation/splitting` — show response sizes for different pages. Each is self-contained. No shared bundle.

### 7.2 Suspense/Loading States → Complete Documents
**Demo page:** `/reorientation/suspense` — page with multiple data queries. All resolve server-side. Client receives complete document. No loading spinners.

### 7.3 Image Optimization → Infrastructure Middleware
**Demo page:** `/reorientation/images` — standard `<img>` tags. Static assets module handles versioning. Note: full image optimization (resize, WebP) would be a future module.

---

## Phase 8: Security Reorientation

### 8.1 API Auth Middleware → Security Through Absence
**Demo page:** `/reorientation/security` — authenticated page. Unauthenticated user sees redirect. Template never sent. The attack surface is what the server provides.

### 8.2 Route Guards → Server-Side Auth Resolution
**Demo page:** `/reorientation/guards` — protected page with htx:auth. No client-side guard. Template resolves conditionally on the server.

### 8.3 "use server" → Physical Separation
**Demo page:** `/reorientation/server-only` — show that .htx templates are server files. The client receives HTML. No mechanism for server code to leak. The separation is architectural, not directive.

---

## Phase 9: Migration Guide Assembly

Compile all examples into `/docs/from-react-to-presto.md`:
- 23 side-by-side comparisons
- Each with: React code → complexity identified → PRESTO layer → PRESTO code → developer experience
- Organized by concern (rendering, hydration, routing, state, data, build, performance, security)
- Opening: "Your path is not from React to PRESTO. It is from the compensating stack to the correct layer."
- Closing: the compensation stack diagram from the survey (steps 1-11)

---

## Deliverables Summary

- ~25 demo pages at `/reorientation/*` exercising every concern
- Side-by-side code comparisons for each
- Comprehensive migration guide document
- All running on the existing presto-ts demo server with all 12 modules
