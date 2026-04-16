# We Built Every Major React Pattern Without React

**And most of them didn't need JavaScript at all.**

---

We took eleven features that React developers build every day — features that typically require Next.js, React Query, Redux, React Hook Form, TanStack Table, dnd-kit, Pusher, and a half-dozen other libraries — and implemented each one at the shallowest constraint depth the feature actually requires.

The results surprised us.

Five of the eleven features needed zero client-side JavaScript. Two needed a few lines of inline script for filtering. Three needed scoped scripts under 40 lines each. One needed a channel token for real-time data.

None of them needed a framework. None of them needed a build step. None of them needed a bundler, a transpiler, a state management library, or a virtual DOM.

Here is what we built and where each feature actually lives in the constraint depth spectrum.

---

## The Surface: Five Features at Zero JavaScript

### 1. A Full CRUD Application

**The React stack:** Next.js with getServerSideProps for data loading, API routes for mutations, React Query for cache management, React Hook Form for the create/edit forms, Server Actions or useMutation for writes, Zod for validation schemas, and a state management library if the app grows. Six to ten npm packages. Multiple files per feature. A build step that takes 10-60 seconds.

**What we built:** Five `.htx` template files. A list page that queries SQLite via a data directive. A detail page that resolves a record by URL slug. A create form, an edit form, and a delete confirmation — each with a server-signed HMAC-SHA256 mutation token injected as a hidden field. Standard HTML forms. Standard POST submissions. The engine verifies the token and executes the mutation.

**Lines of JavaScript:** Zero. The forms submit via the browser's native form submission. The mutation tokens are signed by the server and verified by the server. The entire CRUD cycle — list, view, create, update, delete — operates without a single line of client-side code.

**What was unnecessary:** getServerSideProps (the template has data directives), API routes (the mutation handler is built into the engine), React Query (the data is in the HTML), form libraries (native HTML forms), validation libraries (the server validates on POST), state management (there is no client state to manage).

### 2. Search with Pagination

**The React stack:** useSearchParams for query state, React Query with cache keys keyed on the search term and page number, a Suspense boundary with a loading spinner, error handling for failed queries, and ISR or SWR for cache management. The developer must reason about cache invalidation, stale content, and loading states.

**What we built:** A `<form method="get">` with a search input. The form submits a GET request with query parameters. The server queries SQLite with the search term. The HTML arrives with the results already rendered. Pagination links point to `?page=2`, `?page=3`. Standard HTTP. Standard links.

**Lines of JavaScript:** Zero.

**What was unnecessary:** useSearchParams (GET params are in the URL), React Query (the data is in the HTML), Suspense (the page arrives complete), loading spinners (there is nothing to wait for), ISR (standard Cache-Control headers handle caching), cache invalidation (there is no client cache to invalidate).

### 3. Auth-Gated Pages with Role-Based Rendering

**The React stack:** NextAuth or Auth.js for authentication, a ProtectedRoute wrapper component, useSession for reading auth state, middleware for server-side redirects, and route guards to prevent unauthorized access. The JavaScript bundle contains the route code for all pages — even those the user isn't authorized to see.

**What we built:** An `htx:auth` directive that checks the session during template resolution. If authenticated, the protected content renders. If not, it doesn't. The unauthenticated user receives a response that literally does not contain the protected HTML. There is nothing to guard because there is nothing to protect against — the capability was never provided.

**Lines of JavaScript:** Zero.

**What was unnecessary:** NextAuth (the engine's auth module handles sessions), route guards (unauthorized content is never rendered), ProtectedRoute wrapper (htx:auth is a directive, not a component), useSession (auth state is resolved server-side), client-side redirects (the server redirects before the template renders).

---

## The Shallows: Three Features with Minimal Scripts

### 4. Live Search with Inline Results

**The React stack:** useState for the search term, useEffect with a debounced fetch, React Query or SWR for caching search results, a Suspense fallback while results load, and either a loading spinner or skeleton component. The developer manages cache keys, stale-while-revalidate timing, error states, and the race condition where a slow response arrives after a newer one.

**What we built:** The server renders all published posts into the HTML with data attributes. A 10-line inline script listens to the search input and filters the visible items by matching against the data attributes. Debounced at 150ms.

**Lines of JavaScript:** 10. No fetch. No async. No race conditions. The data was in the page when it arrived.

**What was unnecessary:** useEffect (the data is already present), React Query (there is no client-side fetching), loading states (the results are instant — it's a DOM filter), debounced fetch (the filtering is synchronous), error handling (there is no network request to fail).

### 5. Tab Navigation Without Page Reload

**The React stack:** React Router with nested routes, each tab panel as a lazy-loaded component, Suspense boundaries per panel, client-side state for the active tab, and code splitting so that inactive panels don't increase the initial bundle.

**What we built:** The server renders both tab panels in the same HTML response. A 15-line script toggles which panel is visible when a tab button is clicked. Both panels load instantly because both arrived with the page.

**Lines of JavaScript:** 15. No routing. No lazy loading. No Suspense. No code splitting.

**What was unnecessary:** React Router (there are no routes — it's one page), lazy loading (both panels are already in the HTML), Suspense boundaries (both panels arrived complete), code splitting (there is no bundle), active tab state management (a CSS display toggle).

### 6. Load More / Infinite Scroll

**The React stack:** useInfiniteQuery with page-keyed cache entries, an IntersectionObserver to detect scroll position, a virtual scroll library if the list is long, loading and error states per page, and careful cache management for when the user navigates away and returns.

**What we built:** A button that fetches the next page as an HTML fragment, parses it, and appends the items to the list. A 15-line script.

**Lines of JavaScript:** 15.

**What was unnecessary:** useInfiniteQuery (a fetch + append is simpler), IntersectionObserver (a button is more accessible and less error-prone), virtual scroll (the list is real DOM elements), cache management (the appended items are in the DOM — the DOM is the cache).

---

## Wading Depth: Three Features with Scoped Scripts

### 7. Form with Client-Side Validation and Optimistic Submit

**The React stack:** React Hook Form for form state management, Zod for schema validation, useMutation for submission, optimistic UI updates, error rollback, field-level error display, and submit state management (idle, submitting, success, error). A typical implementation spans 100-200 lines across multiple files.

**What we built:** A server-rendered form with a signed action token. A 40-line script that validates fields on blur (required, min length, slug format), prevents submission when invalid, and POSTs the form data with the token. The submit button disables during submission and shows status.

**Lines of JavaScript:** 40.

**What was unnecessary:** React Hook Form (native form + script), Zod (5 inline validator functions), useMutation (a fetch POST), optimistic UI library (the script updates the button text), field-level state management (the DOM is the state — `input.style.borderColor` is the error indicator).

### 8. Sortable, Filterable Data Grid

**The React stack:** TanStack Table (formerly React Table) with column definitions, sort state, filter state, pagination state, flexRender for cell rendering, and useMemo for computed values. A typical data table implementation in React is 150-300 lines of configuration and hooks.

**What we built:** The server renders all rows into a standard HTML table, with each row's data in data attributes. A 30-line script sorts the rows by re-ordering DOM elements, and filters by toggling display. Column headers are clickable for sort. A text input and select element filter by title and status.

**Lines of JavaScript:** 30. Sort and filter operate directly on the DOM. No virtual rows. No column definition objects. No render functions. The table is a table.

**What was unnecessary:** TanStack Table (a `<table>` element + script), column definitions (the HTML is the column definition), flexRender (the cells are already rendered), sort state / filter state (the DOM is the state), useMemo (there is nothing to memoize — the sort is a DOM reorder).

### 9. Drag-and-Drop Kanban Board

**The React stack:** dnd-kit or react-beautiful-dnd for drag-and-drop, Redux or Zustand for task state, optimistic update middleware, revert-on-error logic, a DragOverlay component for the ghost element, and separate API calls for status updates. A typical Kanban implementation in React is 300-500 lines.

**What we built:** The server renders three columns from three database queries (todo, in-progress, done). Each task card has `draggable="true"`. A 25-line script handles dragstart, dragover, and drop events using the browser's native HTML5 Drag and Drop API. Dropping a card into a column moves the DOM element and logs the new status.

**Lines of JavaScript:** 25. The HTML5 drag API is built into every browser. No library needed.

**What was unnecessary:** dnd-kit (the browser has a drag API), Redux (the DOM is the state — the card is in whichever column it was dropped into), optimistic updates (the DOM move is instant), DragOverlay (the browser provides a ghost element natively), separate API calls (a POST with the action token updates the database).

---

## Mid-Depth: Two Features with Channel Integration

### 10. Real-Time Notification Feed

**The React stack:** Pusher or Socket.io for WebSocket connections, a global notification store (Redux or Zustand), a toast component library, subscription management in useEffect with cleanup, connection retry logic, and notification count state in the header.

**What we built:** The server materializes a scoped channel token via `htx:grant`. A 20-line script subscribes to the channel and prepends notification elements to a list when messages arrive. Notifications animate in with a CSS keyframe.

**Lines of JavaScript:** 20 (plus the 3KB signal system for the production version with data binding).

**What was unnecessary:** Pusher client library (a WebSocket + channel token), global store (the notification list is a DOM element — prepend to it), toast library (a `div` with a CSS animation), subscription cleanup (the channel connection closes with the page), retry logic (the channel utility handles reconnection).

### 11. Collaborative Presence Indicator

**The React stack:** Pusher presence channels, a global user list store, avatar components with online indicators, connection status management, and join/leave event handlers that update the store.

**What we built:** A channel token from `htx:grant`, a 15-line script that listens for join/leave events and renders colored dots with names. The user list is a DOM element. Add a child on join, remove on leave.

**Lines of JavaScript:** 15.

---

## The Numbers

| Recipe | React Stack (npm packages) | PRESTO Depth | JS Lines | Build Step |
|--------|---------------------------|-------------|----------|------------|
| CRUD App | 6-10 packages | Surface (Layer 0) | 0 | None |
| Search + Pagination | 3-5 packages | Surface (Layer 0) | 0 | None |
| Auth-Gated Pages | 3-4 packages | Surface (Layer 0) | 0 | None |
| Live Search | 3-4 packages | Shallows (Layer 1) | 10 | None |
| Tab Navigation | 3-5 packages | Shallows (Layer 1) | 15 | None |
| Load More | 2-3 packages | Shallows (Layer 1) | 15 | None |
| Validated Form | 3-4 packages | Wading (Layer 2) | 40 | None |
| Data Grid | 2-3 packages | Wading (Layer 2) | 30 | None |
| Kanban Board | 3-5 packages | Wading (Layer 2) | 25 | None |
| Notifications | 3-4 packages | Mid-Depth (Layer 4) | 20 | None |
| Presence | 2-3 packages | Mid-Depth (Layer 4) | 15 | None |
| **Total** | **33-50 packages** | | **170 lines** | **None** |

Eleven features. 170 total lines of JavaScript. Five features with zero. No build step for any of them. No node_modules directory. No webpack configuration. No bundle optimization. No hydration. No loading states. No Suspense boundaries. No cache invalidation. No state management library.

---

## What We Learned

The React ecosystem is not a collection of independent tools. It is a compensation stack — each tool solving a problem introduced by the tool beneath it.

React renders on the client → the page arrives empty → SSR compensates → hydration reconnects → the client needs data → React Query compensates → the data needs caching → SWR compensates → all code ships to all users → code splitting compensates → all routes exist on the client → route guards compensate.

Remove the first assumption — that the client should render — and the entire stack dissolves. Not because the tools are bad, but because the problems they solve stop existing.

A form doesn't need a form library when the browser has forms. A table doesn't need a table library when HTML has tables. A drag interaction doesn't need a drag library when the browser has a drag API. Search doesn't need a query cache when the results are in the HTML.

The question developers should ask is not "which React library should I use for this feature?" It is: **what is the shallowest depth at which this feature can exist?**

For most features, the answer is shallower than you think.

---

## Try It

Every recipe in this article is a live, working page:

- `demo.hypermediaapp.org/cookbook/posts` — Full CRUD
- `demo.hypermediaapp.org/cookbook/search` — Search + Pagination
- `demo.hypermediaapp.org/cookbook/protected` — Auth-Gated Pages
- `demo.hypermediaapp.org/cookbook/live-search` — Live Search
- `demo.hypermediaapp.org/cookbook/tabs` — Tab Navigation
- `demo.hypermediaapp.org/cookbook/load-more` — Load More
- `demo.hypermediaapp.org/cookbook/validated-form` — Validated Form
- `demo.hypermediaapp.org/cookbook/data-grid` — Data Grid
- `demo.hypermediaapp.org/cookbook/kanban` — Kanban Board
- `demo.hypermediaapp.org/cookbook/notifications` — Notifications
- `demo.hypermediaapp.org/cookbook/presence` — Presence

The server runs on a Raspberry Pi. The engine is 3,000 lines of TypeScript with zero npm dependencies. The entire demo — 11 features, 12 database-backed modules, live on the public internet — uses 60MB of memory.

View the source of any page. There is no minified bundle. There is no hydration script. There is no framework runtime. There is HTML, and where necessary, a few lines of JavaScript that enhance it.

---

## But You Won't Be Convinced

If you're a React developer, you read the eleven recipes above and thought: "Sure, I could do most of this with plain HTML. I already know that. I choose React because it gives me a mental model I can hold in my head — components, props, state, effects. The surface is powerful but it's wide. I don't want to reason about HTTP caching, representation completeness, and pipeline resolution. I want to reason about my component tree."

You're right. And that reaction reveals something important about what we actually built — and what we got wrong in how we presented it.

### The Real Insight: Constraints Simplify

The eleven recipes demonstrate that features can exist at shallower depths than the React ecosystem assumes. But "shallower" doesn't mean "simpler for the developer." Each layer closer to the surface has more architectural properties — cacheability, universality, server authority — and more to reason about. The surface is the most powerful position, but it's also the widest mental model. That's a real cost.

React's Layer 5 is deep. But deep means narrow. The walls are close. Components, props, state, effects — that's the whole world. A developer who lives there can be productive without understanding HTTP caching, content negotiation, or the bilateral boundary. The constraints of the DO model, while architecturally expensive, are cognitively cheap. That's why React won: not because its architecture is correct, but because its mental model fits in a developer's head.

The question is not "can I build this with less JavaScript?" The question is: **what is the maximum constraint I can accept to simplify my mental model while still covering the majority of my features?**

### The Shift: Start at Your Depth, Escape When You Must

The recipes above start at the surface and show how little code each feature needs. That's impressive to an architect. It's irrelevant to a developer who thinks in React.

The correct approach is the opposite. Start at Layer 5 — the developer's home depth. Give them the full React mental model: components, signals (as state), computed values (as memos), effects, event handlers, client rendering. Let them build the way they already know.

Then show them the escape hatches.

A task manager at Layer 5 with signals, computed stats, filter state, and add/delete handlers works exactly as a React developer expects. But the data was server-rendered into the initial HTML. The developer didn't need getServerSideProps — the data was just there. That's the first escape hatch: data doesn't need the client. React Query dissolves. Not because the developer was persuaded, but because the compensation was simply unnecessary.

The same app has a settings page. It's currently rendered client-side. The developer surfaces it to Layer 0 — a server-rendered template. SSR dissolves. Not because the developer rejected React, but because that page didn't need it. React stays where it belongs: in the bounded region of the app that genuinely requires client-controlled rendering.

### The Four Escapes

We built a Layer 5 task manager (`demo.hypermediaapp.org/layer5/app`) and demonstrated four specific moments where surfacing dissolves a compensation:

**Escape 1: Data.** The app fetches posts client-side. The escape: `htx:data` resolves them into the HTML. What dissolved: API route, useState, useEffect, React Query, loading spinner, error boundary. Six things gone.

**Escape 2: Forms.** The app manages form state with hooks. The escape: `htx:action` signs an HMAC token, native HTML form submits it. What dissolved: React Hook Form, Zod, useMutation, the API route, loading state, toast notifications. Six things gone.

**Escape 3: Auth.** The app checks auth client-side and redirects. The escape: `htx:auth` resolves during template rendering. Unauthorized content is never sent. What dissolved: NextAuth, useSession, ProtectedRoute, client redirect, loading spinner, flash of protected content. Six things gone.

**Escape 4: Content.** The app renders blog posts with React. The escape: they're HTML. What dissolved: the React runtime (200KB), SSR configuration, hydration, code splitting, Suspense, getServerSideProps. Six things gone.

The developer didn't learn a new framework. They recognized that specific features were paying for depth they didn't need. The escape hatch went up — toward more properties, toward less compensation. React remained in the bounded region that genuinely requires it.

### Home Depth

The deeper insight: every developer has a **home depth** — the layer whose constraint-to-property ratio matches the majority of their problems. React forces a home depth of Layer 5 for everyone. htmx encourages Layer 1 for everyone. PRESTO lets the developer choose.

If your application is mostly content with some interactivity, your home depth is Layer 2. You think in templates with scoped scripts. You surface to Layer 0 for pure content. You dive to Layer 4 for a live feature. But most of your day is spent at Layer 2.

If your application is a complex interactive tool, your home depth is Layer 5. You think in components and state. You surface to Layer 0 for the pages that don't need React — and you discover there are more of them than you thought.

The escape hatch that fires constantly is a signal that you've chosen the wrong home depth. If you're at Layer 5 and constantly surfacing to Layer 0, you should be living at Layer 2. If you're at Layer 0 and constantly diving to Layer 3, you should accept Layer 3's mental model as your baseline.

PRESTO doesn't tell you where to live. It gives you the full water column. The eleven recipes in the first half of this article show what the surface looks like. The escape hatches in the second half show how you get there without leaving home.

---

## Try It

Every recipe and escape hatch is a live, working page:

**The Cookbook (shallowest viable depth):**
- `demo.hypermediaapp.org/cookbook/posts` — Full CRUD
- `demo.hypermediaapp.org/cookbook/search` — Search + Pagination
- `demo.hypermediaapp.org/cookbook/kanban` — Kanban Board
- `demo.hypermediaapp.org/cookbook/data-grid` — Data Grid
- `demo.hypermediaapp.org/cookbook/validated-form` — Validated Form
- `demo.hypermediaapp.org/cookbook/notifications` — Notifications

**Layer 5 First (start at home, escape when you can):**
- `demo.hypermediaapp.org/layer5/app` — Full task manager with signals
- `demo.hypermediaapp.org/layer5/escapes/data` — Data doesn't need the client
- `demo.hypermediaapp.org/layer5/escapes/forms` — Forms don't need JavaScript
- `demo.hypermediaapp.org/layer5/escapes/auth` — Auth doesn't need route guards
- `demo.hypermediaapp.org/layer5/escapes/content` — Content pages don't need React

The question is not which React library to use. The question is: what is the shallowest depth at which this feature can exist? And the way to discover the answer is not to start at the surface and work down. It's to start where you are and escape up.

---

## Where This Came From

A server-rendered HTML string is indifferent to the attributes it carries.

Two years ago, the author of this architecture watched a PHP function emit an htmx attribute and noticed that the server didn't care. The function concatenated strings. It didn't parse `hx-get`. It didn't know the attribute meant anything. It resolved its half — the data, the markup — and the client discovered its half — the behavior, the interactivity. Neither side comprehended the other.

From that single observation came the bilateral affordance declaration: the source representation carries instructions for two interpreters, and the first erases its instructions before the second sees the document.

From the bilateral affordance came the progressive layer model: if the server doesn't care what attributes it carries, then the client's capability is a spectrum — from zero JavaScript to WebAssembly — and each degree is independently adoptable.

From the layer model came the encapsulation property: if the representation can carry any client-side instruction, it can carry the bootstrapping instructions for any client-side architecture — including React, including the entire distributed objects model, operating within a bounded region.

From encapsulation came the insight that React's compensation stack is contingent rather than necessary. SSR, hydration, ISR, React Query, route guards — each one recovers a property that the surface provides for free. They exist because the industry placed the DO model outside the REST boundary. They dissolve when the nesting is corrected.

From that contingency came the inverted model: the industry's orientation is backwards. Layer 0 is not where beginners start. It is the position of maximum architectural properties. Depth is cost. The surface was always the correct default.

From the inverted model came the island interface: a standard protocol that lets developers bring their entire React ecosystem with them — every npm package, every component, every hook — while surfacing the rest of their application to the depth where its properties are free.

Seven implementations across seven languages. A 22-stage pipeline. A formal specification. Encapsulation proofs. A cookbook. An island protocol. A complete reframing of how the industry should think about client-server architecture.

All from watching a PHP function not care about an HTML attribute.

The observation was small. The implications were not. And the willingness to follow an observation across two years, seven languages, and an entire architectural reframing — that's the part that most people can't do. Not because they can't see it, but because they stop following before they arrive.
