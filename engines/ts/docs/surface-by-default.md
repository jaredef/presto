# Surface by Default: A Developer's Guide to Constraint Depth

## The Reorientation

For the past decade, web developers have been trained to think upward. Start with a framework. Add SSR. Add hydration. Add state management. Add a router. Add a bundler. Add code splitting. Each addition feels like progress — more capability, more features, more power.

It is the opposite. Each addition is a dive into constraint. Each constrains the representation further, suppresses properties that were free without it, and creates problems that require the next addition to compensate.

This guide reorients the developer's mental model. The surface — a complete HTML document served over HTTP — is not where beginners start. It is where experts arrive. Everything below it is cost.

---

## The Surface

A server-rendered HTML page, with no client-side JavaScript, has the following properties for free:

- **Instant rendering.** The browser paints HTML as it arrives. No JavaScript must parse, compile, and execute before the user sees content.
- **Full cacheability.** Any CDN, proxy, or browser cache can store and serve the response. No cache key strategy. No invalidation logic. Standard HTTP.
- **Universal access.** Screen readers, search crawlers, feature phones, command-line browsers, RSS readers, and every web browser ever built can consume the response.
- **Server authority.** The server decides what the user sees. There is no client-side code to reverse-engineer, no API to probe, no hidden routes to discover.
- **Zero JavaScript.** No bundle to download. No parse time. No compilation. No execution. The page works before a single byte of JavaScript runs.
- **Statelessness.** Each request is independent. No session to manage. No persistent connection to maintain. The server can scale horizontally without coordination.
- **Complete representation.** The response contains everything. No loading spinners. No skeleton screens. No "hydrating..." states. The page is finished when it arrives.

These are not features you build. They are properties induced by the absence of additional constraints. They are what you get when you do nothing beyond serving HTML.

Most of your application can live here. More of it than you think.

---

## The Depth Chart

When a feature cannot be expressed as pure HTML, you dive. Each level of depth accepts a new constraint, gains a specific capability, and trades away properties that were free at the surface.

### The Surface (Layer 0) — Can this be HTML?

Data pages, content pages, forms, navigation, authentication gating, layout composition, error pages. All of these are HTML. The engine resolves data queries, evaluates expressions, composes components, and emits a finished document.

```html
<htx:data type="post" where="status = 'published'" as="posts" />
<htx:each items="posts" as="post">
  <article>
    <h2><htx:v>post.title</htx:v></h2>
    <p><htx:v>post.body</htx:v></p>
  </article>
</htx:each>
```

The server queried the database. The server iterated the results. The server rendered the HTML. The client received a finished page. Zero JavaScript.

**You are done. Stop here unless the feature demands more.**

---

### The Shallows (Layer 1) — Does this need partial updates?

The user clicks a tab and wants new content without a full page reload. The user submits a search and wants results to appear inline. The user deletes an item and wants it to disappear without navigating away.

Add htmx attributes to the HTML elements that need dynamic behavior. The server still renders the fragments. The client swaps them in.

```html
<input type="search" name="q"
  hx-get="/search" hx-trigger="input changed delay:300ms"
  hx-target="#results" />
<div id="results"></div>
```

**Cost:** 14KB library. Marginal visibility reduction.
**Preserved:** Server authority, cacheability, complete representations, statelessness.
**Stop here unless the feature demands more.**

---

### Wading Depth (Layer 2) — Does this need scripted behavior?

A dialog with ESC-to-close. A slider with live value display. A dropdown with keyboard navigation. Behavior that declarative attributes cannot express.

Add an `htx:script` block to the component. The script runs after the complete document is assembled. It enhances what already works — it does not construct it.

```html
<div class="ui-dialog-root">
  <button class="trigger">Open</button>
  <div class="overlay" style="display:none">...</div>
</div>
<htx:script>
  var btn = el.querySelector('.trigger');
  var overlay = el.querySelector('.overlay');
  btn.addEventListener('click', function() { overlay.style.display = 'flex'; });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') overlay.style.display = 'none';
  });
</htx:script>
```

**Cost:** Reduced visibility. The client's behavior is no longer fully determined by the HTML.
**Preserved:** Complete representations, server authority over content, statelessness.
**Stop here unless the feature demands more.**

---

### Open Water (Layer 3) — Does this need pushed code?

A live dashboard where the server sends new data visualizations as they become relevant. A collaborative tool where the server pushes behavioral updates to connected clients. Per-user capability differentiation — one user gets a basic view, another gets an admin panel, based on a server decision at connection time.

Accept a WebSocket connection. The server pushes JavaScript to the client.

**Cost:** Statelessness partially surrendered. The connection is persistent. The client's capabilities are shaped by what the server pushed, which isn't visible in the initial HTML.
**Preserved:** Server authority over what code is delivered. The initial representation is still complete.
**Stop here unless the feature demands more.**

---

### Mid-Depth (Layer 4) — Does this need its own data channel?

The pushed code needs fresh data from the server — not full page HTML, but JSON for a specific UI region. A real-time stock ticker. A chat feed. A notification stream.

The server issues a scoped channel token. The client uses it to fetch JSON from authenticated endpoints.

**Cost:** Additional connection. The client now fetches data independently of template rendering.
**Preserved:** Server authority over data access (token-scoped). Standard HTTP for data requests.
**Stop here unless the feature demands more.**

---

### The Deep (Layer 5) — Does this need client-controlled rendering?

A complex interactive application where the client needs to manage its own routing, preserve state across navigation, and render UI autonomously. A visual editor. A real-time collaborative document. A trading terminal.

The client assumes rendering authority within a bounded region of the page. The REST properties are suspended within that region.

**Cost:** Significant. Server authority delegated. Cacheability suspended within the region. The client is responsible for its own state. SEO requires the Layer 0 shell.
**Preserved:** The Layer 0 shell at the HTTP boundary. The encapsulation holds.
**This is expensive. Confine it to the smallest possible region.**

---

### The Floor (Layer 6) — Does this need native computation?

Image processing. Physics simulation. Cryptographic operations. Video encoding. Machine learning inference. Computation that JavaScript cannot perform efficiently.

WebAssembly modules execute in the browser sandbox at near-native speed.

**Cost:** Maximum. WASM compilation required. Significant client-side computation. Maximum distance from the surface.
**This is the deepest the architecture goes. Use it only when nothing else suffices.**

---

## The Discipline

For each feature you build, ask one question: **What is the shallowest depth at which this feature can exist?**

Not "what technology should I use." Not "what framework does this need." Not "what layer is this feature." The question is about depth. The answer determines how many properties your feature preserves.

A blog post is the surface. A search form with live results is the shallows. A modal dialog is wading depth. A live notification feed is mid-depth. A visual page editor is the deep. A 3D renderer is the floor.

Most features live at the surface or the shallows. The deep is rare. The floor is exceptional.

---

## What You've Been Doing

If you've been building with React, you've been at depth. Layer 5. Client-controlled rendering for everything — the blog post, the marketing page, the settings form, the about page. All at the same depth. All paying the same cost. All surrendering the same properties.

The React ecosystem exists to compensate for this. SSR recovers complete representations — temporarily, before hydration pulls you back to depth. ISR recovers cacheability — through framework-specific logic instead of standard HTTP. React Server Components recover server data access — through a partitioned component model instead of a template that just has it.

Each compensation is a yearning for the surface. Each partially succeeds. None fully arrives. The reason is structural: you cannot recover the properties of the surface while remaining at depth. The properties are induced by the absence of the constraints you're still carrying.

The alternative is not a different framework at the same depth. It is the surface itself. For the features that can live there — and more can than you think — the properties are free.

---

## The Escape Hatch Is Not Free

The earlier sections of this guide present surfacing as pure gain — escape upward, recover properties, pay nothing. This is incomplete. It misses the cost of the broader mental model that less-constrained layers demand.

The depth layers are simpler to work within precisely because their constraints narrow the space of what's possible. A developer at Layer 5 inside a React SPA has a clear, constrained mental model: components, props, state, effects. It's deep, but it's narrow. The walls are close. You know what you can do.

Surfacing to Layer 2 means the developer must now reason about the complete document, the DOM as shared state, the timing of script execution relative to layout composition, the server's resolution pipeline. The properties are richer but the mental model is wider. Surfacing to Layer 0 means reasoning about HTTP caching semantics, content negotiation, intermediary behavior, representation completeness. The properties are maximally rich but the mental model encompasses the full architecture.

Every escape hatch traverses a cognitive boundary. The developer gains properties but accepts a wider field of reasoning. This is not a reason to avoid surfacing — the properties are genuinely valuable. But it means the decision is a trade-off, not a default.

---

## Home Depth

The developer's real discipline is not "surface whenever you can." It is finding the depth where the constraint-to-property ratio best matches the majority of their problems. This is your **home depth** — the layer where you are fluent, where the mental model is internalized, where the trade-offs are second nature.

If the majority of your features require server-rendered pages with scoped interactivity, your home depth is Layer 2. You accept that mental model. You become fluent in it. You dive to Layer 3 or 4 when a specific feature demands a persistent connection or a data channel. You surface to Layer 0 when a feature is pure content. But Layer 2 is where you live.

If the majority of your features are content pages with forms, your home depth is Layer 0. You reason naturally about complete representations, HTTP caching, and server authority. You wade into Layer 2 when a dialog or a slider needs scripted behavior. But you return to the surface immediately afterward.

An escape hatch that fires constantly is a signal. Not that the developer is doing something wrong, but that they've chosen the wrong home depth. If you're at Layer 5 and constantly escaping to Layer 2, you should be living at Layer 2. If you're at Layer 0 and constantly diving to Layer 3, you should accept Layer 3's mental model as your baseline rather than treating every dive as an exception.

This is what makes PRESTO genuinely different from both the React model and the htmx model:

- **React forces a home depth of Layer 5** for every developer on every project. The entire ecosystem is built around this single depth. Compensation mechanisms (SSR, ISR, RSC) simulate surface properties from depth, but the developer's mental model remains at Layer 5.
- **htmx encourages a home depth of Layer 1.** Declarative attributes, server-rendered fragments, minimal JavaScript. Effective for content-heavy applications, but features that require richer client-side behavior demand a framework escape to a different ecosystem entirely.
- **PRESTO lets the developer choose their home depth** based on the actual distribution of their problems — and then escape in either direction when specific features demand it. The architecture doesn't prescribe where you live. It gives you the full water column and lets the problem space determine your natural depth.

---

## Finding Your Home Depth

Audit your application. For each page or feature, note the shallowest depth at which it could exist:

- Content pages, blog posts, documentation → Layer 0
- Forms with server mutations → Layer 0
- Search with live results, filtered lists → Layer 1
- Modals, accordions, tabs, tooltips → Layer 2
- Live notifications, presence indicators → Layer 3-4
- Visual editors, trading terminals, collaborative tools → Layer 5
- Image processing, physics, ML inference → Layer 6

The depth that appears most frequently is your home depth. Design your project conventions, your component library, and your mental model around that depth. Treat other depths as bounded excursions — not exceptions to apologize for, but conscious architectural decisions with explicit trade-off reasoning.

---

## The Principle

The most powerful position in any architecture is the least constrained one. But the most productive position is the one whose constraints match your problems.

Layer 0 induces the most properties. Layer 5 provides the narrowest mental model for complex interactive work. The developer's skill is knowing which depth to inhabit — not always surfacing, not always diving, but finding the water where the problem lives and becoming fluent there.

Every constraint you accept trades breadth for specificity. Every constraint you remove trades simplicity for generality. The architecture that gives you the full water column — and the freedom to choose your depth per feature, per page, per project — is the architecture that respects both the properties of the surface and the necessity of the deep.

Surface by default. Dive by necessity. Find your home depth. Escape when the feature allows. Return when the problem demands.

That is the discipline. That is the reorientation. That is what PRESTO provides: not a ladder to climb, not a surface to cling to, but the full water column — with the knowledge that every depth has its cost, every surface has its reward, and the developer's judgment determines where to live.
