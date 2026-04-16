# The Source-Position Protocol: Identity Without Shared State

## The Pattern

Three independent systems — a tree parser, an attribute injector, and a rendered canvas — need to refer to the same element. They share no runtime. They share no registry. They share no communication channel beyond postMessage. Yet when you click a node in the tree, the correct element highlights in the canvas. When you click an element in the canvas, the correct node highlights in the tree.

The coordination mechanism is the source string itself. Its byte offsets are the universal identifiers.

1. **The tree parser** walks the `.htx` source and assigns each structural node an ID based on its byte offset in the string: `tn-47` means "the tag that begins at character 47."

2. **The builder-ID injector** walks the same source string and injects `data-builder-id="tn-47"` as an HTML attribute at the same position.

3. **The engine's pipeline** resolves all `htx:` directives, consuming them. The `data-builder-id` attribute is a standard HTML attribute — the engine does not know or care about it. It passes through resolution untouched.

4. **The canvas iframe** receives the resolved HTML with the `data-builder-id` attributes intact. When it receives a `tree:select` message with `builderId: "tn-47"`, it queries `[data-builder-id="tn-47"]` and highlights the element.

No shared state. No element registry. No coordination protocol beyond the source string. The tree and the injector independently derive the same IDs from the same input. The IDs survive the bilateral boundary because they are on the client's side of it — standard HTML attributes that the server's resolution does not consume.

## Why It Works

The protocol exploits three properties of the PRESTO architecture:

**1. The source string is the single source of truth.**

Every system that needs to identify an element reads the same `.htx` source. The tree parser reads it to build the node list. The injector reads it to annotate elements. The chat panel reads it to send context to the AI. The save mechanism persists it. There is one string. Every interface derives its view from that string.

Byte offsets within the string are therefore stable identifiers — as long as the string hasn't changed, position 47 always refers to the same tag. When the string changes (from a visual edit, an AI modification, or manual typing), all systems re-derive their state from the new string. The IDs shift to match the new positions. The coordination is always fresh.

**2. The bilateral boundary preserves client-side attributes.**

Contract C1 states that the engine consumes all `htx:` directives and produces pure HTML. But `data-builder-id` is not an `htx:` directive. It is a standard HTML attribute in the client's namespace. The engine's resolution pipeline — include expansion, component resolution, expression evaluation, directive stripping — does not touch it. The attribute enters the pipeline as part of the annotated source and exits the pipeline in the resolved HTML.

This is the bilateral boundary operating as designed: the server's instructions (`htx:` directives) are consumed; the client's instructions (HTML attributes, scripts, standard markup) survive. The builder-ID annotation is a client-side instruction that rides through the server's resolution transparently.

**3. The iframe boundary isolates without preventing communication.**

The canvas is an iframe. The tree is in the parent page. They cannot share JavaScript objects, DOM references, or closures. The only communication channel is `postMessage`. But `postMessage` can carry the string identifier (`"tn-47"`) and the iframe can query its own DOM for `[data-builder-id="tn-47"]`.

The isolation is a feature: the canvas renders the resolved page exactly as a user would see it, without editor-specific JavaScript contaminating the preview. The builder-ID attributes are the only editor-visible annotation in the rendered output, and they are invisible to the user (data attributes don't render).

## The Fractal Observation

The source-position protocol reproduces the PRESTO architecture in miniature.

In PRESTO, the `.htx` source representation carries instructions for two interpreters:
- **The engine** reads the `htx:` directives (server territory)
- **The browser** reads the HTML, scripts, and attributes (client territory)

The engine consumes its instructions. The browser receives what remains. The bilateral boundary separates them.

In the builder, the annotated source carries instructions for three systems:
- **The engine** reads the `htx:` directives (consumed during resolution)
- **The canvas** reads the `data-builder-id` attributes (used for highlighting)
- **The tree** reads the source byte offsets (used for node identification)

The engine consumes its instructions. The canvas and tree receive what remains. The bilateral boundary separates them — the same boundary, operating at a nested level.

This is the architectural encapsulation from Section 4.9 of the white paper, but applied inward rather than outward. The white paper describes REST enclosing the distributed objects style (React operating within a bounded region of a server-rendered page). Here, the PRESTO resolution pipeline encloses the builder's annotation protocol (builder-IDs operating within a resolved representation). The pattern is the same: the outer system consumes its instructions, the inner system's instructions survive because they are in the other namespace.

The builder is a PRESTO application that edits PRESTO applications. The canvas is a PRESTO representation nested inside a PRESTO representation. The bilateral boundary operates at both levels. The source-position protocol works because it places its identifiers on the client side of both boundaries — the inner page's `data-builder-id` attributes survive both the inner resolution (producing the preview) and the outer resolution (producing the editor page).

## The Reusable Pattern

Any system that needs multiple independent consumers to agree on element identity within a PRESTO representation can use this protocol:

1. **Derive IDs from source position.** The byte offset of a tag in the `.htx` source is a stable, deterministic identifier that any parser can independently compute.

2. **Inject IDs as standard HTML attributes.** Use `data-*` attributes that the engine will not consume. The bilateral boundary guarantees their survival.

3. **Coordinate via the source string.** All consumers read the same source. All derive the same offsets. No shared registry needed.

4. **Re-derive on change.** When the source changes, all consumers re-parse and re-derive. The IDs shift to match the new source. Stale IDs are impossible because IDs are computed, not stored.

This pattern applies beyond the builder:

- **Accessibility auditing:** Inject `data-audit-id` attributes at source positions, run the audit on the resolved HTML, map findings back to source positions for the developer.
- **Hot module replacement:** Track which source regions changed, inject `data-hmr-id` attributes, update only the DOM elements whose source regions were modified.
- **Collaborative editing:** Multiple editors share the same source string. Each editor's cursor position maps to a byte offset. Selections and annotations are `data-collab-*` attributes that survive resolution.
- **AI-assisted editing:** The AI's modifications to the source can be diff'd against the original, and the changed regions can be highlighted in the canvas by comparing builder-IDs before and after.

In each case, the source string is the coordination mechanism. Byte offsets are the universal identifiers. Standard HTML attributes are the transport. The bilateral boundary guarantees survival. No shared runtime needed.

## The Deeper Principle

The source-position protocol is a specific instance of a general property: **in an architecture where the source representation is the single source of truth, identity can be derived from position rather than assigned from a registry.**

React requires element identity because the virtual DOM needs stable keys to diff against the previous tree. The keys are assigned (`key={item.id}`) because the component tree is constructed programmatically — there is no source string to derive positions from.

PRESTO doesn't require assigned identity because the source string IS the identity layer. Every tag has a position. Every position is unique. Every consumer can independently compute the same position from the same string. The "registry" is the source itself. The "coordination protocol" is the act of reading the same document.

This is the bilateral boundary applied to the problem of identity: the server doesn't need to assign IDs because the source string already provides them. The client doesn't need to maintain a registry because it can re-derive positions on every render. The builder doesn't need a shared runtime because all its consumers read the same source.

The source is the protocol. The position is the identity. The bilateral boundary is the guarantee.
