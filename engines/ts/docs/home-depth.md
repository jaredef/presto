# Home Depth: Finding Where You Live in the Water Column

## The Missing Concept

The PRESTO layer model describes a water column — the surface (Layer 0) at the top, the floor (Layer 6) at the bottom, and every depth between. The inverted layer model establishes that the surface is the position of maximum properties and that each deeper layer trades properties for specific capabilities.

What neither model addresses is where the developer *lives*.

A developer does not make a depth decision for every line of code. They internalize a mental model — a set of constraints, patterns, and trade-offs that become second nature. They think in that model. They solve problems in it. They reach for its idioms instinctively.

This is their home depth. And choosing it well is the most consequential architectural decision a developer makes on a project.

---

## Why Home Depth Matters

Every depth in the water column has a mental model. The deeper the layer, the narrower the model — fewer properties to reason about, fewer possibilities to consider, tighter walls. The shallower the layer, the wider the model — more properties available, more architectural surface area, more to hold in mind.

**Layer 0's mental model:** HTTP semantics. Cache-Control headers. Content negotiation. Representation completeness. The template declares data needs; the engine resolves them; the response is a finished document. The developer reasons about what the server renders, what intermediaries do with it, and what the browser receives. The model is wide. The properties are rich.

**Layer 2's mental model:** Complete documents enhanced by scoped scripts. The developer reasons about the DOM as shared state, script execution timing relative to document assembly, signal-based reactivity for surgical updates. The model is moderate. The developer holds both the server's resolution and the client's enhancement in mind simultaneously.

**Layer 5's mental model:** Components, props, state, effects. The client owns rendering. The developer reasons about component trees, state flows, re-render boundaries, and side effect timing. The model is narrow. The walls are close. You know exactly what you can do — and the framework enforces it.

Each model has genuine cognitive advantages. Layer 0's width gives the developer access to the full property spectrum of the web platform. Layer 5's narrowness gives the developer confidence about what happens next — the framework constrains the space so tightly that the developer can predict behavior from the model alone.

The question is not which model is better. The question is which model matches the majority of the developer's problems.

---

## The Signal of the Constant Escape Hatch

An escape hatch that fires constantly is a signal. Not that the developer is doing something wrong, but that they've chosen the wrong home depth.

**If you live at Layer 5 and constantly escape to Layer 2:** Your features don't need client-controlled rendering. They need server-rendered pages with scoped interactivity. You're paying the cost of Layer 5's constraints (no server authority, no native cacheability, hydration overhead) for features that don't require Layer 5's properties (preserved client state, autonomous routing). Move your home depth to Layer 2.

**If you live at Layer 0 and constantly dive to Layer 3:** Your features need persistent connections and pushed code more often than not. You're repeatedly accepting the WebSocket constraint as an exception when it's actually the norm for your application. Accept Layer 3 as your home depth. Internalize its mental model. Stop treating the dive as a deviation.

**If you live at Layer 2 and rarely escape in either direction:** You've found your home depth. The constraint-to-property ratio matches your problem space. Most of your features are server-rendered with client enhancement. The occasional Layer 0 page (pure content) and the occasional Layer 4 feature (real-time data) are genuine exceptions, not symptoms of a misaligned baseline.

The escape hatch is not a failure mode. It is a calibration instrument. Its frequency tells you whether your home depth is correct.

---

## How Frameworks Choose For You

Every framework makes a home depth decision on behalf of the developer. Most don't acknowledge this.

**React** sets your home depth to Layer 5. Every component renders on the client. Every interaction is mediated by the virtual DOM. Every data requirement is fulfilled by client-side fetching (or compensations like RSC that partially recover server rendering). The developer's mental model is components, props, state, effects — regardless of whether the feature demands client-controlled rendering.

The consequence: features that could live at the surface (content pages, forms, documentation) are built at Layer 5 depth. They carry Layer 5's costs (JavaScript bundle, hydration, no native cacheability) without benefiting from Layer 5's properties (preserved client state, autonomous rendering). The React ecosystem builds compensations (SSR, SSG, ISR) to recover surface properties from Layer 5 depth.

**htmx** sets your home depth to Layer 1. Declarative attributes on HTML elements. Server-rendered fragments swapped into the page. Minimal JavaScript. The developer's mental model is HTML attributes, server endpoints, and fragment replacement.

The consequence: features that need richer client-side behavior (drag-and-drop, complex forms, real-time visualization) require leaving the htmx model entirely. There is no Layer 2, 3, 4, or 5 within htmx's architecture. The developer must import a different framework for those features, managing two mental models simultaneously.

**Next.js** attempts to span depths. File-based routing (Layer 0 convention), server rendering (Layer 0 property), client components (Layer 5 behavior), server components (partial Layer 0 recovery). The developer's mental model must encompass both ends of the water column and the serialization boundary between them.

The consequence: the developer manages two mental models within a single framework — server components that cannot use state or effects, client components that cannot access server resources. The boundary between them is a constant source of friction. The framework spans depths but doesn't let the developer choose a home.

**PRESTO** does not prescribe a home depth. The architecture provides the full water column. The developer chooses their home depth based on the distribution of their problems, and escapes in either direction when specific features demand it. The mental model at each depth is coherent and self-contained. The escape hatches between depths are explicit architectural transitions, not framework workarounds.

---

## Choosing Your Home Depth

Audit your application. For each page or feature, note the shallowest depth at which it could exist:

| Feature | Shallowest Viable Depth |
|---------|------------------------|
| Blog post, documentation page, marketing page | Surface (Layer 0) |
| Form with server mutation (create, update, delete) | Surface (Layer 0) |
| Search with live results, filtered list, pagination | Shallows (Layer 1) |
| Modal dialog, accordion, tabs, tooltip, slider | Wading depth (Layer 2) |
| Live notification feed, presence indicator | Mid-depth (Layer 4) |
| Collaborative editor, visual builder, trading terminal | The deep (Layer 5) |
| Image processing, physics simulation, ML inference | The floor (Layer 6) |

Count the features at each depth. The depth with the most features is your candidate home depth.

Then ask: **Can I internalize this depth's mental model as my default mode of thinking?**

If the majority of your features are at Layer 0 and Layer 2, your home depth is Layer 2. You think in terms of server-rendered documents with scoped enhancements. Layer 0 pages are simpler versions of what you already do. Layer 4 dives are bounded excursions with explicit trade-off reasoning.

If the majority of your features genuinely require Layer 5 (complex interactive applications with preserved state and autonomous routing), your home depth is Layer 5. Accept that mental model. Use PRESTO's encapsulation to confine Layer 5 to bounded regions of Layer 0 representations, but don't pretend you're living at the surface.

The home depth is honest. It reflects what you actually build, not what you aspire to build. The architecture supports wherever you land.

---

## The Fluency Threshold

There is a cost to changing home depth mid-project. Mental models take time to internalize. A developer who has spent years at Layer 5 (React) cannot surface to Layer 0 overnight and reason fluently about HTTP caching semantics and representation completeness. A developer who has lived at Layer 0 (server-rendered templates) cannot dive to Layer 5 and immediately think in component trees and state flows.

This is not a criticism. It is an acknowledgment that mental models are skills, and skills require practice. The transition between depths has a learning curve — not because the architecture is complex, but because the developer is building new fluency.

PRESTO's contribution is not eliminating this cost. It is making the cost visible and the transition explicit. When a developer moves from Layer 5 to Layer 2, they know what they're gaining (server authority, cacheability, no hydration) and what they're accepting (a wider mental model, DOM-centric reasoning, pipeline awareness). The trade-off is stated, not hidden.

The frameworks that hide this cost — that force a single depth and simulate other depths through compensations — do the developer a disservice. The compensations feel like the developer is operating at multiple depths simultaneously. In reality, they are at one depth (the framework's prescribed depth) with lossy approximations of other depths layered on top. The mental model is not multi-depth; it is single-depth with exceptions that don't quite work.

PRESTO's multi-depth model is harder to learn initially. But it is honest. Each depth has a coherent mental model. Transitions between depths are architectural decisions with explicit costs and benefits. The developer knows where they are, what they've traded, and how to get back.

---

## The Full Water Column

The web is not a single depth. It is a water column. Some applications live at the surface. Some live in the deep. Most live at a home depth somewhere in between, with occasional dives and occasional surfacing.

The architecture that respects this reality — that provides coherent mental models at every depth, explicit transitions between them, and the freedom to choose where to live based on the actual distribution of problems — is the architecture that serves the widest range of developers building the widest range of applications.

PRESTO does not tell you where to live. It gives you the water column and trusts you to find your depth.

The only thing it insists on is that the surface exists, the properties are real, and the path back to it is always open.
