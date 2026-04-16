# The Uniform Directive Interface

## The Observation, Again

A PHP function concatenating an HTML string doesn't care about the attributes it carries. The server is indifferent to client declarations.

The inverse is also true. An htx: directive on the server doesn't care where its data came from. The directive is indifferent to the implementation that fulfilled its requirements.

`htx:auth` does not implement authentication. It declares a boundary: "render this content if `request.auth.user` exists." Where that value came from — whether it was read from an HMAC-signed cookie, verified against a JWT, validated by a third-party API, or looked up in a database — the directive does not know and cannot know. It checks a condition. The condition was either met or it wasn't.

This is the bilateral boundary operating in both directions:

- **Server → Client:** The server's directives are consumed before the client sees the document. The client is indifferent to how the HTML was produced.
- **Implementation → Directive:** The module's implementation is consumed before the directive evaluates. The directive is indifferent to how its requirements were fulfilled.

The directive is a contract. It specifies what it needs — not how to get it.

## The Pattern

Every htx: directive that reads from the data context operates through the same uniform interface:

```
Module (implementation) → Context Provider → Data Context → Directive (declaration)
```

The module registers a context provider at boot. The provider executes at Stage 4 of the pipeline, populating the data context with values. The directive evaluates later in the pipeline, reading from the context. The directive doesn't know which module provided the value. The module doesn't know which directive will consume it.

This separation is not incidental. It is the architecture operating as designed. Contract C5 (Extensions) specifies that modules register context providers. The pipeline specifies that context injection (Stage 4) precedes directive evaluation (Stages 9-15). The ordering guarantees that any module can provide data for any directive without either knowing about the other.

## Authentication: The First Example

`htx:auth` evaluates at Stage 13. It checks `data.auth.user`. If present, the block renders. If absent, it doesn't.

The data context was populated at Stage 4 by whichever auth module was registered. The module's context provider returned `{ auth: { user: { id, name, role } } }`. The shape is the contract. The implementation behind it is the module's concern.

This means `htx:auth` works with any auth provider that produces this shape:

| Provider | Module Implementation | Template |
|----------|----------------------|----------|
| Native (HMAC sessions) | Reads `htx_session` cookie, verifies HMAC signature | `<htx:auth>` — unchanged |
| Better Auth | Reads Better Auth session, calls verification API | `<htx:auth>` — unchanged |
| WorkOS | Reads WorkOS session cookie, verifies via SDK | `<htx:auth>` — unchanged |
| Clerk | Reads `__session` cookie, verifies JWT | `<htx:auth>` — unchanged |
| Auth0 | Reads Auth0 session, validates token | `<htx:auth>` — unchanged |
| Supabase Auth | Reads Supabase session, verifies via client | `<htx:auth>` — unchanged |
| Firebase Auth | Reads Firebase ID token, verifies signature | `<htx:auth>` — unchanged |
| OAuth2 (generic) | Reads access token cookie, validates against provider | `<htx:auth>` — unchanged |
| SAML | Reads SAML assertion, validates signature | `<htx:auth>` — unchanged |

The template is always unchanged. The module is always swappable. The directive is always the same. There is no lock-in because the template never references the implementation. It references the contract.

## Data: The Same Pattern

`htx:data` evaluates at Stage 10. It calls `adapter.query()` or `adapter.get()`. The content adapter is an interface with five methods: `query`, `get`, `create`, `update`, `delete`.

Which adapter? Whichever was registered at boot.

| Adapter | Implementation | Template |
|---------|---------------|----------|
| SQLite | Queries a local `.db` file | `<htx:data type="post">` — unchanged |
| PostgreSQL | Queries a Postgres connection | `<htx:data type="post">` — unchanged |
| MySQL | Queries a MySQL connection | `<htx:data type="post">` — unchanged |
| MongoDB | Queries a Mongo collection | `<htx:data type="post">` — unchanged |
| REST API | Fetches from an external HTTP API | `<htx:data type="post">` — unchanged |
| GraphQL | Queries a GraphQL endpoint | `<htx:data type="post">` — unchanged |
| In-memory | Reads from a JavaScript Map | `<htx:data type="post">` — unchanged |
| File system | Reads markdown files from a directory | `<htx:data type="post">` — unchanged |

The template author writes `<htx:data type="post" where="status='published'" as="posts" />` and the engine resolves it against whatever adapter is registered. The adapter could be SQLite today and PostgreSQL tomorrow. The template doesn't change. The directive is the uniform interface. The adapter is the pluggable implementation.

## Grants: The Same Pattern

`htx:grant` evaluates at Stage 11. It calls a grant provider by type. The provider returns a signed credential.

| Grant Type | Provider Implementation | Template |
|------------|------------------------|----------|
| WebSocket | Issues HMAC-signed channel token | `<htx:grant type="websocket">` — unchanged |
| Channel | Issues module-scoped Bearer token | `<htx:grant type="channel">` — unchanged |
| Asset | Signs URL with HMAC + expiry | `<htx:grant type="asset">` — unchanged |
| Custom | Any provider returning a string credential | `<htx:grant type="custom">` — unchanged |

The grant provider is registered by a module. The directive doesn't know how the credential is signed. It knows the credential was produced. The template consumes it.

## Mutations: The Same Pattern

`htx:action` evaluates at Stage 12. It signs a mutation token encoding the action, type, and record ID. The verification at POST time checks the signature and routes to the adapter.

The adapter handles the mutation. Which adapter? The same one that handles `htx:data`. The template author declares `<htx:action name="create" type="post" />` and the engine handles signing, verification, and execution. The adapter could be SQLite, Postgres, or a REST API. The template is unchanged.

## The Deeper Observation

The PHP observation was: the server doesn't care about client declarations.

The directive observation is: the directive doesn't care about server implementations.

Both are consequences of the same architectural property: **the representation is the contract, not the implementation.** The `.htx` template is a declaration of intent. The engine fulfills the intent using whatever modules, adapters, and providers are registered. The template author writes against the directive interface, not against the implementation.

This is why the template is portable. A template that works with SQLite works with PostgreSQL. A template that works with native auth works with Clerk. A template that works on presto-ts works on presto-go or presto-c or any conformant engine. The directives are the uniform interface. The implementations are behind the module boundary.

This is also why AI generation is cheap. The AI generates directives, not implementations. `htx:auth` is one line regardless of whether the auth provider is native HMAC, Better Auth, or WorkOS. The AI doesn't need to understand the provider's API, SDK, configuration, or session format. It needs to understand the directive. The directive is the same across all providers.

And this is why there is no lock-in. The template references directives, not packages. There is no `import BetterAuth from 'better-auth'` in the template. There is no `<ClerkProvider>` wrapper. There is no `useSession()` hook. There is `htx:auth`. The provider is a boot-time configuration decision that the template is unaware of.

## The Principle

Every htx: directive is a uniform interface. The directive declares what the template needs. The module provides how it's fulfilled. The pipeline connects them in order. The template never sees the implementation. The implementation never constrains the template.

This is the bilateral boundary applied inward. The outer bilateral boundary separates server and client: the server's directives are consumed, the client's HTML survives. The inner boundary separates directive and implementation: the directive's requirements are fulfilled, the module's implementation is consumed by the pipeline before the directive evaluates.

Both boundaries exist because the representation is the contract. The template declares. The engine fulfills. What the engine used to fulfill — which module, which adapter, which provider, which signing algorithm — is invisible in the template and invisible in the output.

The PHP function doesn't care about the attribute. The directive doesn't care about the module. The output doesn't contain either. The representation is complete, and what made it complete is absent.
