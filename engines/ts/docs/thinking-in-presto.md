# Thinking in PRESTO

An authorial mental model for building within REST's constraints.

## The One Concept

Everything in the `htx:` namespace is consumed by the server. Everything else survives to the client.

This is the bilateral boundary. The developer writes a source representation that addresses two interpreters simultaneously. The engine (server) reads the `htx:` directives, resolves data, evaluates expressions, materializes credentials, and emits pure HTML. The browser (client) reads the HTML, executes scripts, renders the document, and provides the interactive surface to the user.

The first interpreter erases its own instructions before the second interpreter ever sees the document.

From this single concept, you can reason about everything:

- **What will the server resolve?** Anything in the `htx:` namespace: directives, expressions, bindings.
- **What will the client receive?** Pure HTML, scoped scripts, resolved values frozen at render time.
- **What capabilities does the client have?** Only what the server granted: tokens, channel URLs, delivered code.
- **When does client code execute?** After the document is complete. The DOM is the source of truth.

## The Three Questions

Before writing any template, ask:

1. **What data does this page need?** Use `htx:data` to declare it. The engine queries at render time.
2. **What structure does this page have?** Write HTML. Use `htx:component` for reusable pieces.
3. **Does this page need client behavior?** If yes, add `htx:script`. If no, you're done.

Most pages need less behavior than you think.

## Progressive Layers

Each layer adds capability. Each is independently adoptable. You don't choose a layer for your application. You choose a layer for each feature.

| Layer | What You Write | What the Client Gets |
|-------|---------------|---------------------|
| 0 | HTML + htx: directives | Complete HTML, zero JS |
| 1 | + htmx attributes | HTML + 14KB htmx library |
| 2 | + htx:script blocks | HTML + scoped IIFEs |
| 3 | + topology files | HTML + server-delivered JS |
| 4 | + htx:grant channels | HTML + authenticated WebSocket |
| 5 | + client routing | Autonomous SPA navigation |
| 6 | + WASM modules | Native-speed computation |

## Components as Directive Macros

A PRESTO component is an `.htx` file. Not a JavaScript class. Not a function that returns JSX. A file.

The file contains three sections:

```html
<htx:props>
title = "Default"
</htx:props>
<div class="my-component">
  <h2>{{ title }}</h2>
  <htx:slot />
</div>
<htx:script>
  // Optional: runs on the client, scoped to this component's DOM
  el.addEventListener('click', function() { /* ... */ });
</htx:script>
```

- `htx:props` defines the interface (with defaults)
- The body is HTML + any htx: directives (data, each, if, grant, action)
- `htx:script` is extracted, wrapped in an IIFE, and scoped via `data-htx-id`

When you use the component:

```html
<htx:component src="/ui/card.htx" title="My Title">
  <p>This goes into the slot.</p>
</htx:component>
```

The engine expands it at Stage 7. All directives in the expanded body resolve in subsequent stages. The client receives flat HTML with no trace of the component structure.

## Data Binding Without Fetch

In React, you fetch data in an effect:
```jsx
const [posts, setPosts] = useState([]);
useEffect(() => { fetch('/api/posts').then(r => r.json()).then(setPosts); }, []);
```

In PRESTO, you declare data needs in the template:
```html
<htx:data type="post" where="status='published'" order="id desc" limit="10" as="posts" />
```

The engine queries at render time. The client receives HTML with the data already rendered. No loading state. No fetch. No effect.

## Reactive State Without Re-rendering

In React, state changes trigger re-renders of the entire subtree:
```jsx
const [count, setCount] = useState(0);
// Every setCount re-renders this component and all its children
```

In PRESTO, signals update only the specific DOM nodes that reference them:
```javascript
var count = signal(0);
bind(el.querySelector('.count'), count);
// count.value = 5 → only the .count element updates
```

No virtual DOM. No diffing. No reconciliation. O(1) updates per bound node.

## Forms Without a Framework

A form with signed mutation authorization, zero client JavaScript:

```html
<htx:component src="/ui/form.htx" action="create" type="post">
  <htx:component src="/ui/input.htx" label="Title" name="title" required="required" />
  <htx:component src="/ui/textarea.htx" label="Body" name="body" />
</htx:component>
```

The engine generates a signed action token (HMAC-SHA256) and injects it as a hidden field. The form submits as a standard POST. The server verifies the token and executes the mutation. No JavaScript. No API route. No client-side validation library.

## The Escape Hatch

Every library component can be replaced with raw directives. The component's source IS the escape path.

**Using the library:**
```html
<htx:component src="/ui/data-table.htx" type="post" columns="title,status" />
```

**Reading the source to understand what it does:**
```html
<!-- It's just htx:data + htx:each + a table. I can write that myself. -->
```

**Escaping to raw directives:**
```html
<htx:data type="post" as="posts" />
<table>
  <htx:each items="posts" as="post">
    <tr><td><htx:v>post.title</htx:v></td></tr>
  </htx:each>
</table>
```

The library adds convenience. Removing it doesn't change the architecture.

## Channels and Grants

When the client needs a capability beyond HTML (a WebSocket, a data channel, a protected file), the server grants it:

```html
<htx:grant type="channel" module="notifications" as="notify_token" />
```

The engine signs a time-limited, scoped token (HMAC-SHA256) and materializes it into the page. The client uses the token to authenticate:

```javascript
var ch = channel('wss://host/api/channel/notifications', token);
ch.on('message', function(data) { /* handle */ });
```

The grant is visible in the source representation. The authority chain is traceable. The token expires. This is REST's constraint (server authority) applied to real-time capabilities.

## What Not to Do

- **Don't fetch data on the client when the server already has it.** Use `htx:data`.
- **Don't add a script when HTML is sufficient.** Most UI is Layer 0.
- **Don't build a virtual DOM.** The real DOM is the source of truth. Signals update it directly.
- **Don't manage routes on the client unless you need Layer 5.** Links and server navigation work.
- **Don't reach for a state manager.** Signals cover local state. The server covers persistent state.

## The Mental Model in One Sentence

You are writing a document that two interpreters will read sequentially, and the first will erase its instructions before the second sees the page.
