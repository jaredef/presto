# The Unified Builder: Visual Editing + AI Chat on One Representation

## An Industry Converging on a Problem It Cannot Solve

In 2026, the web development tool industry is converging on a single goal: unify visual building and AI generation into one environment. The direction is clear. The execution is structurally blocked.

**WeWeb** positions itself as the strongest hybrid — AI prompts generate full apps, then a visual editor refines them. But the visual layer is Vue.js components. The AI generates Vue code. The unification is within a single framework's domain, not across the architectural boundary.

**Builder.io** (with Visual Copilot) converts Figma designs into React code using the team's existing design system. The bridge is Figma → AI → code → developer. The visual tool (Figma) and the production output (React) remain separate representations with AI as the translator between them.

**Figma Make** turns Figma into an AI code generator. Designers create visuals; AI produces frontend code. But the output is framework-specific code that developers must take into their repositories. The designer's visual representation and the developer's code representation are still different artifacts.

**v0 by Vercel** generates React/Next.js from prompts, images, or Figma inputs, with a "design mode" for visual fine-tuning. The generation target is React components with Tailwind. The visual editing operates on the rendered output, not on the generation source. Editing the visual and editing the code are two different actions on two different representations.

**Bolt.new** combines a visual interface with AI coding agents to generate full-stack prototypes. The AI generates Next.js + Supabase. The visual tools refine the rendered output. The code and the visual remain parallel tracks that the AI bridges per-request.

**The common pattern:** every tool follows the same architecture: AI generates framework-specific code (React, Vue, Next.js) → visual tools operate on the rendered output or on a separate design representation → developers work in the code. The three representations — design, code, and rendered output — remain distinct. The tools add collaboration features, prompt interfaces, and visual refinement layers, but the fundamental architecture is three representations with translation layers between them.

**The structural problem:** the visual representation (what the designer sees), the code representation (what the developer edits), and the rendered output (what the user receives) are different formats. No amount of AI-powered translation eliminates the round-trip between them. The designer adjusts the visual → the AI must translate to code → the developer verifies the code → the build system produces the output. Each translation step is lossy. Each introduces potential for divergence between what the designer intended, what the code expresses, and what the user sees.

The industry is converging on the right goal. The tooling is sophisticated. The engineering is impressive. And the problem is unsolvable within the current architecture because the architecture requires three representations where one would suffice.

## What PRESTO Changes

In PRESTO, the visual representation, the code representation, and the rendered output are the same format: `.htx` templates.

The `.htx` template IS the code — it contains the directives, expressions, and component references that declare the page's data needs and behavior.

The `.htx` template IS the visual representation — it is HTML elements with attributes that a visual builder can manipulate spatially.

The `.htx` template, when resolved by the engine, IS the rendered output — the 22-stage pipeline produces the complete HTML document the user sees.

One format. Not three representations with translation layers. One representation that all three interfaces — visual, conversational, and rendered — operate on directly.

These two paradigms have never been combined into a single coherent tool. The reason is structural: they produce incompatible outputs.

A visual builder produces HTML and CSS — a surface-level representation of the design. An AI chat builder produces React/JSX code — a deep, compiled, framework-specific representation of behavior. The visual builder's output doesn't know about React's component model. The AI builder's output doesn't know about the visual builder's drag-and-drop coordinates. They operate at different depths on different representations with different output formats.

To combine them in the current architecture, you would need a translation layer between the visual builder's HTML output and the AI builder's JSX output — a bidirectional compiler that converts between two fundamentally different representations while preserving both visual fidelity and behavioral correctness. Nobody has built this because the problem is intractable. The representations are incompatible at the architectural level.

## Why PRESTO Dissolves the Incompatibility

In PRESTO, both paradigms produce the same output: `.htx` templates.

The visual builder manipulates `.htx` source. When the user drags a Card from the palette, the builder inserts `<htx:component src="/ui/card.htx" title="New Card">Content</htx:component>` into the template source. When the user changes a prop in the property panel, the builder modifies the attribute value in the source string. When the user rearranges components, the builder reorders the corresponding fragments in the source.

The AI chat interface also produces `.htx` source. When the user says "add a blog post list with pagination," the AI generates the `htx:data` + `htx:each` + component pattern and inserts it into the source. When the user says "make the cards use a 3-column grid," the AI wraps the existing components in a CSS grid container.

Both interfaces read from and write to the same representation. The `.htx` source is the single source of truth. The preview is the same — the engine resolves the source through the 22-stage pipeline. The persistence is the same — save to SQLite. The output is the same — a `.htx` file that any conformant engine can serve.

The unification is not a feature we need to build. It is a consequence of the representation being the same format at every depth. HTML with directives is simultaneously:
- What the visual builder manipulates (spatial editing of elements and attributes)
- What the AI generates (declarative template source from natural language)
- What the engine resolves (22-stage pipeline producing complete HTML)
- What the browser renders (standard HTML document)

One format. Four interfaces to it. No translation layer.

## The Unified Builder

### The Interface

```
┌────────────��──────────────────────────────────────────────┐
│ Toolbar: page name, save, preview, export, source toggle  │
├─────────┬─────────��────────────────────┬──────────────────┤
│Component│                              │ Properties Panel │
│Palette  │   Canvas (iframe)            │                  │
│         │   Live preview of resolved   │ Selected element │
│ Drag &  │   .htx template              │ props, styles    │
│ Drop    │                              │                  │
│         │                              │                  │
├─────────┴────────────────────────��─────┴──────────────────┤
│ Chat Interface                                             │
│ User: "Add a sidebar with tag filtering"                   │
│ AI: [modifies .htx source, preview updates]                │
│ User: [drags a Badge component into the sidebar]           │
│ AI: [sees the change] "I see you added a badge. Want me    │
│      to connect it to the tag data?"                       │
└────────────────────────────���──────────────────────────────┘
```

The top half is the visual builder — the same editor we already built at `/editor`. Component palette, canvas with live preview, property panel. The user drags, drops, selects, and edits visually.

The bottom half is the chat interface. The user types natural language requests. The AI reads the current `.htx` source, generates modifications, and the preview updates. The chat sees the same source the visual builder sees.

Both operate on the same `source` signal. When the visual builder modifies the source, the chat can observe the change. When the chat modifies the source, the canvas updates and the property panel reflects the new state.

### How They Complement Each Other

**Visual for layout, chat for logic.**

The user drags a Card, a Badge, and a Button onto the canvas. Arranges them in a row. Sets the Card's title to "My Post." This is spatial work — trivial in the visual builder, awkward in chat.

Then the user types: "Make this card repeat for each published blog post, with the title from the database and a badge showing the status." The AI recognizes the card, wraps it in `<htx:data>` + `<htx:each>`, replaces the static title with `{htx:post.title}`, and adds a badge with `{htx:post.status | capitalize}`. This is logic work — trivial for the AI, complex in the visual builder.

The result: a data-driven card grid that the user laid out visually and the AI connected to the database. Neither tool could have produced this as efficiently alone.

**Visual for precision, chat for patterns.**

The user types: "Create a dashboard with user stats, a post list, and a task kanban board." The AI generates the page structure — three sections with the appropriate data directives, components, and layout. The initial result is functional but generic.

The user then visually adjusts: drags the stats section to be a horizontal row instead of stacked, changes the card variant to "outline," moves the kanban board to span full width, adjusts padding. This is pixel-level refinement that natural language struggles to express.

**Chat for complex data, visual for simple props.**

The user types: "Add a form that creates a new blog post with title, body, and tags, using a select dropdown for the category." The AI generates the `htx:action` + form component with nested input components and the correct mutation token. This is a multi-component pattern with signed security tokens — the AI handles the complexity.

The user then visually selects the title input and changes the placeholder text. Selects the submit button and changes its variant to "primary." These are simple prop changes that the property panel handles in one click.

### How Islands Integrate

When the user needs a capability that requires Layer 5 — a chart, a rich text editor, a map — the chat interface handles the depth:

**User:** "Add an interactive chart showing post views over time"

**AI generates:**
1. An island definition file (`islands/post-views-chart.tsx`) using Recharts
2. The `<template>` data bridge with the serialized view data
3. The `<htx:component src="/ui/island.htx" name="post-views-chart">` mount point

The island appears in the canvas as a bounded region. The visual builder shows it as a block with a "Layer 5 Island" badge. The user can drag it to reposition it on the page. The property panel shows the island's name and data source.

The visual builder handles the spatial placement. The AI handles the complex code generation. The island protocol handles the depth boundary. All three cooperate on the same `.htx` source.

### The Conversation Is Contextual

The chat interface sees everything:
- The current `.htx` source (what the page looks like now)
- The component registry (what building blocks are available)
- The database schema (what data types exist)
- The user's recent visual edits (what changed since the last message)

This enables contextual conversation:

**User drags a Card component onto the canvas.**
**AI:** "I see you added a card. Would you like me to connect it to data from the database? You have post, task, and user tables available."

**User:** "Yes, make it show the latest 5 posts"
**AI modifies source:** wraps in `htx:data` + `htx:each`, binds title and body expressions.

**User selects a post card and clicks "Edit" in the property panel.**
**AI:** "That card is inside an htx:each loop rendering published posts. Do you want to edit the card template (affects all posts) or create a separate detail view for individual posts?"

The AI understands the structure because the structure is the `.htx` source — a format the AI reads natively. There is no translation between "what the visual builder shows" and "what the AI understands." They are the same document.

## What Doesn't Exist Yet

The visual builder exists (the PRESTO Builder at `/editor`). The AI generation capability is documented and the infrastructure exists (preview endpoint, save endpoint, component registry). The island protocol exists. What remains to build:

1. **Chat panel integration** — adding a chat interface to the editor page that sends prompts to an LLM with the current source as context
2. **Bidirectional awareness** — the chat observing visual edits and the visual builder reflecting chat modifications on the same signal
3. **Island generation** — the chat producing `defineIsland()` files and triggering the build command
4. **Schema awareness** — the chat knowing what database tables exist and suggesting appropriate data directives

Each of these is a feature addition to the existing builder, not a new architecture. The builder already edits `.htx` source. The chat would also edit `.htx` source. The preview endpoint already resolves it. The save endpoint already persists it.

## Why the Industry Cannot Solve This

Every tool in the 2026 landscape follows the same architecture: three representations with translation layers between them.

| Representation | Who Owns It | Format |
|---------------|-------------|--------|
| Design | The designer (Figma, visual canvas) | Proprietary visual format |
| Code | The developer (VS Code, repo) | JSX/Vue/Svelte + framework config |
| Output | The build system (Vercel, Netlify) | Compiled HTML/JS bundles |

The AI operates as a translator: design → code (Builder.io, Figma Make), prompt → code (v0, Bolt, Lovable), visual → code (WeWeb). Each translation is lossy. The designer's intent doesn't map perfectly to components. The code doesn't map perfectly back to the visual. The build output doesn't correspond 1:1 to either source.

This is why every tool in the market adds qualifiers: "designers stay in Figma," "developers refine in code," "AI handles the handoff." The handoff exists because the representations are different. The AI manages the translation. But translation between incompatible formats is a fundamentally lossy operation. The industry is optimizing the translator instead of eliminating the need for translation.

## What PRESTO Changes

PRESTO eliminates the three-representation problem by providing a single format — `.htx` templates — that is simultaneously all three:

| Concern | Three-Representation Model | PRESTO |
|---------|---------------------------|--------|
| Design | Figma / proprietary canvas | The `.htx` template is HTML — the visual builder manipulates it directly |
| Code | JSX / framework source | The `.htx` template is the code — directives declare data, behavior, composition |
| Output | Compiled bundles | The engine resolves the `.htx` template into complete HTML |
| AI role | Translator between formats | Generator of the single format |

The visual builder doesn't produce a design artifact that the AI translates to code. It edits the `.htx` source directly. The AI doesn't generate framework code that the developer must verify against the design. It generates `.htx` source that the visual builder can display and the engine can resolve. The engine doesn't compile from a different source format. It resolves the same `.htx` template the visual builder and AI both operate on.

No translation. No handoff. No divergence between design intent, code reality, and rendered output. One representation, three interfaces.

## The Competitive Advantage

The tools in the market — WeWeb, Builder.io, Figma Make, v0, Bolt — are engineering achievements. They have teams of hundreds, millions in funding, and years of development. They are optimizing a three-representation architecture with AI-powered translation layers.

A PRESTO-based unified builder does not compete on the quality of the translation. It eliminates the need for translation. The competitive advantage is not better AI, better visual tools, or better code generation. It is that the architecture requires one representation where the industry requires three.

This is the same pattern as the compensation stack. The industry builds increasingly sophisticated solutions (SSR, hydration, ISR, React Server Components) to recover properties that the architecture suppressed. Here, the industry builds increasingly sophisticated translation layers (AI code gen, visual-to-code, design-to-code) to bridge representations that the architecture separated.

PRESTO dissolves both. The compensation stack dissolves because REST induces the properties natively. The translation layer dissolves because one representation serves all interfaces.

## The Product Implication

The web development tool market assumes that designers and developers need different tools because they work at different levels of abstraction. The designer thinks visually. The developer thinks logically. The AI translates between them.

A unified PRESTO builder rejects this assumption. The designer drags components and adjusts layouts — on the `.htx` source. The developer types "add authentication and a CRUD API for blog posts" — modifying the same `.htx` source. The AI generates data patterns and component structures — producing the same `.htx` source. All three see the same preview because all three operate on the same representation.

The designer's visual work and the developer's logical work coexist in the same `.htx` file without conflict because the format supports both: HTML elements for visual structure, `htx:` directives for data and behavior, component references for reusable patterns, and islands for complex interactivity when Layer 5 capability is needed.

This is not a feature advantage. It is an architectural category difference. The tools in the market are optimizing within the three-representation model. The unified PRESTO builder operates in a one-representation model. The gap is not marginal. It is structural.

That architecture is here. The builder is built. The AI generation infrastructure exists. The preview endpoint resolves any source through the full pipeline. The island protocol handles any depth. The component library provides 34 building blocks. The module kit provides 13 server-side behaviors. The seed provides the AI's complete context in 2,020 words.

The only remaining work is connecting them — a chat panel that reads and writes the same signal the visual builder reads and writes.

Two paradigms. One representation. One preview. One save. The unified builder.
