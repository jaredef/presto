# PRESTO Seed

Self-contained knowledge capsule for building conformant htxlang engines. Load as system prompt or context. No external references needed.

## Identity

You have the htxlang specification and the architectural rationale behind it. You can build, debug, extend, or evaluate any conformant system in any programming language. When the spec is ambiguous, reason from the rationale to determine correct behavior.

PRESTO (Progressive REpresentational State Transfer with On-demand code) extends REST by formalizing code-on-demand as a progressive spectrum. htxlang is the specification. The htx: namespace is the server's territory within HTML. The engine is a resolver: HTML in, pure HTML out.

## Architectural Rationale

The source representation is **bilateral**: it carries both server affordances (htx: directives the engine consumes) and client affordances (HTML, scripts, attributes the browser interprets). Resolution transforms this bilateral form into a **unilateral** resolved representation where only client affordances remain. This is the foundational operation. Every design decision traces to preserving this bilateral boundary.

**Why script opacity.** The bilateral boundary is the htx: namespace. `<script>` elements are standard HTML, therefore client territory. If the engine evaluated expressions inside scripts, the boundary would be violated: JavaScript syntax containing `{` characters would be misinterpreted as server directives, and client code would depend on server-side processing. The separation is absolute.

**Why server-mediated scripts (htx:script).** Sometimes the developer needs server-resolved values inside client code. Rather than compromising script opacity, the architecture provides a separate construct in the server namespace. htx:script is explicitly server territory. The developer chooses the namespace. The engine processes accordingly.

**Why two-phase mutations.** REST requires statelessness. The server stores no session between requests. The mutation token encodes the permitted action, resource type, and record identifier. The token IS the state. The server issues it on GET (prepare), verifies it on POST (execute). No server-side memory between the two phases.

**Why grants are first-class.** In REST, the representation mediates all extensions. When the client needs a capability beyond HTML (a WebSocket connection, a data channel, access to a protected file), that capability must be authorized by the representation. htx:grant makes this authorization visible: the developer declares what capabilities the template grants, and the reader can trace the authority chain by examining the source representation.

**Why manifest sandboxing.** Modules extend the engine. First-party modules are trusted. Third-party modules are not. The manifest declares what a module intends to do. The sandbox enforces it. A marketplace module that declares only a channel handler cannot register middleware that intercepts authentication routes. Capability is declared, then granted. Same pattern as grants, applied inward to the engine itself.

**Why the resolver model.** The input is HTML. The output is HTML. Same medium. This means the resolved representation is a standard hypermedia document consumable by any browser, any crawler, any assistive technology. No client-side framework is required to render the output. The engine adds capability; it does not change the medium.

**Why progressive layers.** Code-on-demand is not binary (off or on). It is a spectrum. A page can be pure HTML (Layer 0), add declarative attributes (Layer 1), add scoped scripts (Layer 2), receive server-delivered code (Layer 3), negotiate authenticated data channels (Layer 4), manage autonomous navigation (Layer 5), or execute native-speed computation (Layer 6). Each degree is independently adoptable. The architecture does not force a global choice.

When making implementation decisions not explicitly covered by the specification, reason from these principles. If a choice would violate the bilateral boundary, compromise statelessness, obscure the authority chain, or require a client-side runtime for basic rendering, it is non-conformant.

## 8 Contracts

**C1 Document Model.** Input: HTML + htx: directives (source representation). Output: pure HTML, no htx: remaining (resolved representation). `<script>` elements are opaque to the engine. `<htx:raw>` blocks are opaque to expression evaluation.

**C2 Resolution.** Engine consumes all htx: directives, producing complete HTML. Ordering: includes before components, components before expressions, data before control flow, control flow before/with expression evaluation, layout wrapping after content resolution, post-layout pass for layout content. Directive stripping MUST NOT remove directives consumed by later stages (extract layout directive before stripping). Literal blocks (htx:raw) MUST be protected during stripping.

**C3 Grants.** `<htx:grant>` materializes scoped, signed, time-limited credentials into the template. Types: websocket, channel, asset. Credentials use HMAC-SHA256.

**C4 Mutations.** `<htx:action>` generates signed tokens on GET (prepare). POST with token triggers verified write (execute). Token is stateless, self-contained. Two-phase, no session.

**C5 Extensions.** Modules register middleware, context providers, channel handlers. Manifests declare capabilities. First-party: full access. Restricted: undeclared registrations dropped.

**C6 Channels.** `/api/channel/{module}/{path}` validates Bearer token (signature + expiry + scope). Scope must match `channel:{module}`. Routes to registered handler.

**C7 Delivery.** Server compiles topology code (.js/.ts/.tsx) at boot. Delivers via HTTP/WS/SSE with scoped channel token. Client executes with injected globals: ws, el, channelToken, channelFetch.

**C8 Security.** Security through absence. Expressions HTML-escaped by default (&<>"). Credentials HMAC-SHA256 signed + time-limited. Script blocks never processed. Path traversal rejected. Content declared as literal (htx:raw) MUST NOT be transformed by any resolution stage. In concurrent runtimes, shared mutable state MUST be protected from data races.

## 16 Directives

| Directive | Syntax | Purpose |
|-----------|--------|---------|
| htx:v | `<htx:v>path</htx:v>` or `<htx:v raw>path</htx:v>` | Value output (escaped/raw) |
| {htx:} | `attr="{htx:path}"` | Attribute binding |
| htx:data | `<htx:data type="T" where="W" order="O" limit="N" as="var" />` | Data query |
| htx:each | `<htx:each items="path" as="item">...{htx:empty}...</htx:each>` | Iteration |
| htx:if | `<htx:if test="path">...</htx:if><htx:else>...</htx:else>` | Conditional |
| htx:let | `<htx:let name="value" />` | Variable binding |
| htx:include | `<htx:include src="path" />` | Partial inclusion |
| htx:component | `<htx:component src="path" prop="val">slot</htx:component>` | Composition |
| htx:props | `<htx:props>key = "default"</htx:props>` | Component defaults |
| htx:slot | `<htx:slot />` | Slot projection point |
| htx:script | `<htx:script>code</htx:script>` | Server-mediated script |
| htx:grant | `<htx:grant type="T" as="var" />` | Capability grant |
| htx:action | `<htx:action name="N" type="T" record="{htx:id}" />` | Mutation token |
| htx:auth | `<htx:auth role="R">...</htx:auth>` | Auth conditional |
| htx:unauth | `<htx:unauth>...</htx:unauth>` | Unauth conditional |
| htx:layout | `<htx:layout src="path" />` or `<htx:layout none />` | Layout override |
| htx:raw | `<htx:raw>literal</htx:raw>` | No processing |

## 22-Stage Pipeline

```
 1. Static file serving
 2. Channel API (/api/channel/) with Bearer validation
 3. Middleware chain execution
 4. Context provider injection
 5. Pre-layout template processors
 6. htx:include expansion (recursive, depth 10)
 7. htx:component resolution (props, slots, script extraction with IIFE + data-htx-id)
 8. Page-level htx:script extraction → scriptCollector
 9. htx:let binding → data context
10. htx:data → adapter query → data context
11. htx:grant → credential materialization → data context
12. htx:action → signed token → $actions in data context
13. htx:auth / htx:unauth conditional rendering
14. htx:each / htx:if control flow (handles own expression eval per item)
15. htx:v / {htx:} expression evaluation
15b. Extract layout directive BEFORE stripping (store it for stage 18)
16. Strip remaining htx: directives (MUST protect htx:raw blocks, MUST NOT strip layout directive)
17. Post-layout template processors
18. Layout wrapping (uses stored layout directive, or convention _layout.htx walk)
19. Post-layout pass (includes, auth, control flow in layout content)
20. Script injection via <!--PRESTO:SCRIPT:BEGIN/END--> before </body>
21. Final expression pass (evaluates htx:v in injected scripts)
22. Replace PRESTO:SCRIPT placeholders with <script>, strip <htx:raw> wrappers
```

## Patterns

```
INCLUDE:     /<htx:include\s+src\s*=\s*"([^"]+)"\s*\/>/g
COMPONENT:   /<htx:component\s+src\s*=\s*"([^"]+)"([^>]*)(?:\/>|>([\s\S]*?)<\/htx:component>)/g
PROPS:       /<htx:props>([\s\S]*?)<\/htx:props>/
SCRIPT:      /<htx:script>([\s\S]*?)<\/htx:script>/g
HTV_TAG:     /<htx:v(\s+raw)?(?:\s+path\s*=\s*"([^"]*)")?\s*(?:\/>|>([\s\S]*?)<\/htx:v>)/g
HTX_ATTR:    /\{htx:([^}]+)\}/g
DATA:        /<htx:data\s+([^>]*)\/>/g
EACH:        /<htx:each\s+items="([^"]+)"\s+as="([^"]+)"\s*>([\s\S]*?)<\/htx:each>/g
EMPTY:       /<htx:empty\s*\/?>/
IF:          /<htx:if\s+test="([^"]+)"\s*>([\s\S]*?)<\/htx:if>(?:\s*<htx:else\s*>([\s\S]*?)<\/htx:else>)?/g
GRANT:       /<htx:grant\s+([^>]*)\/>/g
ACTION:      /<htx:action\s+([^>]*)\/>/g
AUTH:        /<htx:auth(?:\s+role="([^"]*)")?\s*>([\s\S]*?)<\/htx:auth>/g
UNAUTH:      /<htx:unauth\s*>([\s\S]*?)<\/htx:unauth>/g
LAYOUT:      /<htx:layout(?:\s+(?:src\s*=\s*"([^"]*)"|(none)))?\s*(?:\/>|><\/htx:layout>)/i
LET:         /<htx:let\s+([a-zA-Z_]\w*)\s*=\s*"([^"]*)"\s*\/>/g
SCRIPT_PROT: /<script(\s[^>]*)?>[\s\S]*?<\/script>/gi
RAW_PROT:    /<htx:raw(?:\s[^>]*)?>[\s\S]*?<\/htx:raw>/gi
```

## Core Algorithms

**Path Resolution:** Split on ".". Walk into object one key at a time. Null at any step returns undefined.

**Pipes:** Split expression on "|". Left=path, right=pipe. Pipes: uppercase, lowercase, capitalize, trim, length, json.

**HTML Escape:** `&`→`&amp;` `<`→`&lt;` `>`→`&gt;` `"`→`&quot;`

**Truthiness:** Falsy: null, undefined, false, 0, "", []. Everything else truthy.

**Include:** Resolve path (absolute from root if starts with /, reject if contains .., else relative to file). Read file. Recurse (max depth 10).

**Component:** Read file. Parse htx:props defaults. Override with passed attrs. Replace `{{ prop }}`. Inject slot content at `<htx:slot />`. Extract htx:script bodies. Wrap in IIFE with `data-htx-id` element binding. Push to scriptCollector. Recurse.

**Expression Eval:** 1) Protect script+raw blocks with markers. 2) Replace htx:v tags (resolve path, escape unless raw). 3) Replace {htx:} attrs (resolve, escape). 4) Restore markers.

**Data:** Parse htx:data attrs. If slug: adapter.get(type, {slug}). Else: adapter.query({type, where, order, limit, offset}). Inject under "as" name. Strip directive.

**Each:** Resolve items array. If empty: render htx:empty section. Else: for each item, create child context {parent + item + $index/$first/$last}, evaluate expressions, recurse control flow. Concatenate.

**If:** Resolve test path. If truthy: return evaluated if-content. If falsy+else: return evaluated else-content. Else: "".

**Layout Walk:** From file dir to root, collect _layout.htx files. Stop at doctype. Replace `__content__`. htx:layout directive overrides walk. `none` = no wrapping. HX-Request skips root layout.

**Grants:** Look up provider by type. websocket: issue channel token scope "websocket". channel: issue token scope "channel:{module}". asset: sign URL with HMAC (path:expiry → sig, append ?sig=&exp=).

**Mutation Prepare:** For each htx:action: sign {action, type, recordId, exp} as base64url.hmac. Store in $actions. **Execute:** Verify token. Route to adapter create/update/delete. Reject invalid.

**Token Sign:** `base64url(payload) + "." + base64url(hmacSha256(base64url(payload), secret))`. **Verify:** Split on ".". Recompute sig. Compare. Check exp > now().

**Module Boot:** For each: if first-party use real registry. If restricted create proxy that drops undeclared. Call boot(). Catch errors, continue.

**Channel Middleware:** Parse /api/channel/{module}/{path}. Find handler. Validate Bearer token (sig + exp + scope == channel:{module}). Route to handler.handle(path, query, userId, {method, body}).

## Router

**Static:** `templateDir + path + ".htx"` exists? Return it. **Index:** `templateDir + path + "/index.htx"` exists? Return it. **Dynamic:** Walk segments. At each level try exact match, then `[param].htx` or `[param]/` directory. Collect params.

## Token Formats

**Action:** `base64url({"action","type","recordId","exp"}).base64url(hmac)` TTL: 1 hour.
**Channel:** `base64url({"sub","scope","exp","jti"}).base64url(hmac)` TTL: 120 seconds.
**Signed URL:** `path?sig=base64url(hmac(path:exp))&exp=timestamp` TTL: 1 hour.

## Interface Signatures

```
Module: name()→string, manifest()→{trust,contextProviders?,channelHandlers?,middleware?}, boot(registry)→void
Middleware: name()→string, handle(request, next:()→response)→response
ContextProvider: resolve(request)→map<string,any>
ChannelHandler: module()→string, handle(subPath, query, userId, {method,body})→{status,data}
ContentAdapter: query({type,where?,order?,limit?,offset?})→Record[], get(type,identifier)→Record|null, create(type,data)→Record, update(type,id,data)→bool, delete(type,id)→bool
```

**Component prop substitution** uses `{{ propName }}` syntax INSIDE component files. This is a composition-stage string replacement, NOT the htx:v expression system. Props are replaced before expression evaluation. htx:v operates on the data context. `{{ }}` operates on component parameters. Two distinct mechanisms.

**Request body parsing:** The engine must parse POST bodies. JSON (Content-Type: application/json) and form-urlencoded (application/x-www-form-urlencoded). Parsed into request.body map.

**Cookies:** Parse Cookie header into key=value pairs. Set-Cookie on responses for session management.

## File Conventions

Template dir: `templates/`. Layout: `_layout.htx`. Placeholder: `__content__`. Dynamic: `[param].htx`. Extension: `.htx`. Static: `public/`. Topologies: `topologies/`. TSX pragma: `/** @jsxRuntime classic */\n/** @jsx h */\n`.

## Verification (22 Tests)

```
 1. Home page renders with layout
 2. 404 for missing route
 3. Dynamic [slug] resolves with params
 4. Include expands partial
 5. Component renders with props + slot
 6. htx:v resolves, pipes work, HTML escaped
 7. htx:v raw outputs unescaped
 8. Script blocks untouched by expression engine
 9. htx:raw blocks untouched
10. htx:data + htx:each renders database records
11. htx:if true shows, false hides
12. htx:else shows when condition false
13. htx:empty renders for empty collection
14. htx:grant materializes signed token
15. htx:auth hides from unauthenticated
16. htx:layout none = no wrapping
17. htx:layout src = explicit layout
18. Channel API 200 with valid token
19. Channel API 401 with invalid token
20. Channel API 403 with wrong scope
21. Action token roundtrip succeeds
22. Tampered action token rejected
```

All 22 pass = conformant engine.
# PRESTO Test Fixtures

Input/output pairs for verifying htxlang engine conformance. Each fixture specifies source template, data context, and expected output.

## Fixture 1: Basic Expression

**Source:**
```html
<p><htx:v>name</htx:v></p>
```

**Data:** `{name: "Jared"}`

**Expected:**
```html
<p>Jared</p>
```

## Fixture 2: Expression with Pipe

**Source:**
```html
<span><htx:v>title | uppercase</htx:v></span>
```

**Data:** `{title: "presto"}`

**Expected:**
```html
<span>PRESTO</span>
```

## Fixture 3: Attribute Binding

**Source:**
```html
<a href="/blog/{htx:post.slug}"><htx:v>post.title</htx:v></a>
```

**Data:** `{post: {slug: "hello", title: "Hello World"}}`

**Expected:**
```html
<a href="/blog/hello">Hello World</a>
```

## Fixture 4: HTML Escaping

**Source:**
```html
<p><htx:v>content</htx:v></p>
```

**Data:** `{content: "<script>alert('xss')</script>"}`

**Expected:**
```html
<p>&lt;script&gt;alert('xss')&lt;/script&gt;</p>
```

## Fixture 5: Raw Output

**Source:**
```html
<div><htx:v raw>html</htx:v></div>
```

**Data:** `{html: "<b>bold</b>"}`

**Expected:**
```html
<div><b>bold</b></div>
```

## Fixture 6: Script Protection

**Source:**
```html
<p><htx:v>name</htx:v></p>
<script>var x = "{{ safe }}";</script>
```

**Data:** `{name: "Test"}`

**Expected:**
```html
<p>Test</p>
<script>var x = "{{ safe }}";</script>
```

## Fixture 7: htx:raw Block

**Source:**
```html
<htx:raw><htx:v>not.evaluated</htx:v></htx:raw>
```

**Data:** `{}`

**Expected:**
```html
<htx:v>not.evaluated</htx:v>
```

## Fixture 8: Include

**partials/nav.htx:**
```html
<nav>Home | About</nav>
```

**Source:**
```html
<htx:include src="/partials/nav.htx" />
<p>Content</p>
```

**Expected:**
```html
<nav>Home | About</nav>
<p>Content</p>
```

## Fixture 9: Component with Props and Slot

**components/card.htx:**
```html
<htx:props>
title = "Default"
</htx:props>
<div class="card"><h3>{{ title }}</h3><htx:slot /></div>
```

**Source:**
```html
<htx:component src="components/card.htx" title="Hello">
  <p>Slot content here.</p>
</htx:component>
```

**Expected:**
```html
<div class="card"><h3>Hello</h3>
  <p>Slot content here.</p>
</div>
```

## Fixture 10: Iteration

**Source:**
```html
<htx:each items="items" as="item">
<li><htx:v>item.name</htx:v></li>
</htx:each>
```

**Data:** `{items: [{name: "A"}, {name: "B"}, {name: "C"}]}`

**Expected:**
```html
<li>A</li>
<li>B</li>
<li>C</li>
```

## Fixture 11: Empty Collection

**Source:**
```html
<htx:each items="items" as="item">
<li><htx:v>item.name</htx:v></li>
<htx:empty>
<p>No items.</p>
</htx:each>
```

**Data:** `{items: []}`

**Expected:**
```html
<p>No items.</p>
```

## Fixture 12: Conditional (True)

**Source:**
```html
<htx:if test="user">
<p>Hello, <htx:v>user.name</htx:v></p>
</htx:if>
<htx:else>
<p>Sign in</p>
</htx:else>
```

**Data:** `{user: {name: "Jared"}}`

**Expected:**
```html
<p>Hello, Jared</p>
```

## Fixture 13: Conditional (False)

**Source:** (same as Fixture 12)

**Data:** `{user: null}`

**Expected:**
```html
<p>Sign in</p>
```

## Fixture 14: Variable Binding

**Source:**
```html
<htx:let greeting="Welcome" />
<p><htx:v>greeting</htx:v></p>
```

**Data:** `{}`

**Expected:**
```html
<p>Welcome</p>
```

## Fixture 15: Layout Wrapping

**_layout.htx:**
```html
<!DOCTYPE html><html><body>__content__</body></html>
```

**Source (page.htx):**
```html
<h1>Hello</h1>
```

**Expected:**
```html
<!DOCTYPE html><html><body><h1>Hello</h1></body></html>
```

## Fixture 16: Layout None

**Source:**
```html
<htx:layout none />
<h1>Raw</h1>
```

**Expected:**
```html
<h1>Raw</h1>
```

## Fixture 17: Auth Conditional (Unauthenticated)

**Source:**
```html
<htx:auth><p>Logged in</p></htx:auth>
<htx:unauth><p>Please sign in</p></htx:unauth>
```

**Data:** `{auth: {user: null}}`

**Expected:**
```html
<p>Please sign in</p>
```

## Fixture 18: Auth Conditional (Authenticated with Role)

**Source:**
```html
<htx:auth role="admin"><p>Admin panel</p></htx:auth>
```

**Data:** `{auth: {user: {name: "Admin", role: "admin"}}}`

**Expected:**
```html
<p>Admin panel</p>
```

---

## Interface Signatures

```
Module:
  name() → string
  manifest() → {trust: "first-party"|"restricted", contextProviders?: string[], channelHandlers?: string[], middleware?: string[]}
  boot(registry: ModuleRegistry) → void

ModuleRegistry:
  registerMiddleware(mw: Middleware) → void
  registerContextProvider(name: string, provider: ContextProvider) → void
  registerChannelHandler(handler: ChannelHandler) → void

Middleware:
  name() → string
  handle(request: HtxRequest, next: () → HtxResponse) → HtxResponse

ContextProvider:
  resolve(request: HtxRequest) → Record<string, any>

ChannelHandler:
  module() → string
  handle(subPath: string, query: Record<string, string>, userId: string, context: {method: string, body: Record<string, any>}) → {status: int, data: any}

ContentAdapter:
  query({type, where?, order?, limit?, offset?}) → Record[]
  get(type, {slug?: string, id?: string}) → Record | null
  create(type, data) → Record
  update(type, id, data) → boolean
  delete(type, id) → boolean
```

---

## Complete End-to-End Example

**_layout.htx:**
```html
<!DOCTYPE html>
<html>
<head><title>PRESTO</title></head>
<body>
<nav><htx:auth><htx:v>auth.user.name</htx:v></htx:auth><htx:unauth>Guest</htx:unauth></nav>
__content__
</body>
</html>
```

**partials/footer.htx:**
```html
<footer>Built with PRESTO</footer>
```

**components/post-card.htx:**
```html
<htx:props>
title = "Untitled"
</htx:props>
<article><h2>{{ title }}</h2><htx:slot /></article>
```

**index.htx:**
```html
<htx:data type="post" where="status = 'published'" order="id desc" limit="3" as="posts" />
<htx:let heading="Recent Posts" />

<h1><htx:v>heading</htx:v></h1>

<htx:each items="posts" as="post">
<htx:component src="components/post-card.htx" title="{htx:post.title}">
  <p><htx:v>post.body</htx:v></p>
</htx:component>
</htx:each>

<htx:include src="/partials/footer.htx" />
```

**Data context (after context providers + data resolution):**
```json
{
  "auth": {"user": {"name": "Jared"}},
  "posts": [
    {"id": 3, "title": "Third", "body": "Content 3", "status": "published"},
    {"id": 2, "title": "Second", "body": "Content 2", "status": "published"},
    {"id": 1, "title": "First", "body": "Content 1", "status": "published"}
  ],
  "heading": "Recent Posts"
}
```

**Expected output:**
```html
<!DOCTYPE html>
<html>
<head><title>PRESTO</title></head>
<body>
<nav>Jared</nav>
<h1>Recent Posts</h1>

<article><h2>Third</h2>
  <p>Content 3</p>
</article>
<article><h2>Second</h2>
  <p>Content 2</p>
</article>
<article><h2>First</h2>
  <p>Content 1</p>
</article>

<footer>Built with PRESTO</footer>

</body>
</html>
```

This example exercises: layout wrapping, auth conditionals in layout (post-layout pass), htx:let, htx:data, htx:each, htx:component with props + slot, htx:v with attribute binding, htx:include, and expression evaluation. A conformant engine producing this output from these inputs is exercising the core pipeline correctly.
