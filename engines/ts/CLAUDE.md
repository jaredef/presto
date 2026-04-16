# PRESTO-TS v3 — Project Context

## What This Is

The TypeScript implementation of the PRESTO engine, derived from the Progressive Representational State Transfer with On-demand code architectural style. Every directive traces to a constraint. Every constraint traces to REST.

This is the successor to the @htx/engine in hypermediaapp.com. It was conceived, planned, and built by studying what the PRESTO style prescribes and implementing the obvious syntax.

## Repository

https://github.com/hypermediacms/presto-engine (remote)

Local path: /home/jaredef/presto-ts

## Phased Planning & Execution Loop

All significant work follows a phased planning and execution loop, tracked in `/.plans/`:

1. **Master plan**: Write a markdown file at `/.plans/{feature}-plan.md` with all phases listed (status: NOT STARTED)
2. **Phase planning**: For each phase, create `/.plans/{prefix}-phase-{n}-{name}.md` with objectives, files to modify, and an execution log
3. **Execute**: Implement the phase, run tests, validate
4. **Update**: Mark the phase doc as COMPLETE, fill in the execution log with what was done
5. **Commit**: `git add -A && git commit && git push` after each phase completes
6. **Notify**: Push a status update to Telegram at each phase boundary
7. **Repeat**: Move to the next phase and repeat steps 2-6

## Key Architectural Decisions

1. **HTML base medium** — resolver model, same medium in and out
2. **htx: namespace IS the bilateral boundary** — everything with htx: prefix is server territory, `<script>` is client territory
3. **Unified expressions: `<htx:v>`** — replaces both `{{ }}` and `__field__` from legacy. One syntax for all server-resolved values. Pipes via `|`.
4. **`<htx:data>` consolidates queries** — replaces 6 scattered directives (htx:type, htx:where, htx:order, htx:howmany, htx:offset, htx:slug)
5. **`<htx:grant>` makes authority visible** — first-class capability grant syntax. Credentials are deliberate declarations.
6. **`<htx:each>` / `<htx:if>`** — explicit namespace-consistent control flow
7. **`<htx:script>` at page level** — server-mediated scripts, expressions evaluated. `<script>` is always client territory.
8. **`<htx:layout>` directive** — convention-based with directive override
9. **`<htx:auth>` / `<htx:unauth>`** — auth-conditional rendering
10. **`<htx:let>`** — template variable binding
11. **`<htx:raw>`** — literal blocks, no expression evaluation

## The 22-Stage Resolution Pipeline

Defined in `src/pipeline.ts`.

1. Static file serving
2. Channel API (/api/channel/{module}/{path} with Bearer token validation)
3. Middleware chain (from module registry)
4. Context providers (from module registry to template data)
5. Pre-layout template processors
6. Include resolution (htx:include)
7. Component resolution (htx:component with props, slots, htx:script extraction)
8. Page-level htx:script extraction
9. htx:let variable binding
10. htx:data resolution (queries adapter, injects into context)
11. htx:grant credential materialization
12. htx:action mutation token preparation
13. htx:auth / htx:unauth conditional rendering
14. htx:each / htx:if control flow
15. Expression evaluation (htx:v, {htx:...})
16. Directive stripping
17. Post-layout template processors
18. Layout wrapping
19. Post-layout includes + auth + control flow (for layout content)
20. Script injection (comment placeholders)
21. Final expression pass
22. Placeholder to script tag replacement + htx:raw finalization

## Source Structure

```
src/
  types.ts
  pipeline.ts
  router.ts
  engine.ts
  expressions.ts
  adapters/
  directives/
  islands/
  llm/
  modules/
  security/
    tokens.ts   — ActionTokenService, ChannelTokenService, SignedUrlService
  realtime.ts   — RealtimeEngine (WebSocket topology delivery)

modules/        — 17 modules
demo/
editor/
tests/
```

## Security

- **PathGuard** — prevents directory traversal on all file access
- **HMAC-SHA256** — signs action tokens, channel tokens, and signed URLs (`src/security/hmac.ts`)
- **Fingerprint binding** — tokens optionally bound to client fingerprint (IP + UA hash)
- **ChannelTokenService** — issues short-lived (120s) scoped tokens; `issue()` returns `Promise<string>`
- **ActionTokenService** — issues longer-lived (1h) mutation tokens with two-phase prepare/execute pattern

## Tests

238 tests. Run with:

```bash
bun test
```

## Running the Demo

```bash
bun src/server.ts
# Listens on http://127.0.0.1:4000
```

## Running the Editor

```bash
bun editor/server.ts
# Listens on http://127.0.0.1:4040
```

## Module System

17 modules in `modules/`. Each module can register:
- Middleware
- Context providers
- Template processors
- Channel API handlers

## User

Jared Foy (pseudonym: Jared De La Fe / JuanDeLaFe). Architect of the PRESTO style. Communicates via Telegram. Real name for publications is Jared Foy. Never add Co-Authored-By lines to git commits.

## Key Principles

- The architecture does the design work. The constraints prescribe the decisions.
- The abstraction is in the constraints, not in the code.
- "There is nothing between the idea and the execution except the constraints themselves."
- Show, don't tell. Let the ideas speak. No self-aggrandizing language.
- Attribute to predecessors. Frame as the obvious conclusion of prior work.
- No em dashes (indicator of AI slop). No framework name-dropping in critiques.
- htx: namespace = server territory. `<script>` = client territory.

## Technical Notes

- Default to Bun, not Node.js. `bun test`, `bun src/server.ts`.
- `bun:sqlite` for SQLite. No external packages needed.
- Topology compilation: .tsx files get `/** @jsxRuntime classic */\n/** @jsx h */\n` prepended before Bun.Transpiler.
- Expression engine protects `<script>` and `<htx:raw>` blocks from evaluation.
- Scripts from htx:script are injected via comment placeholders (PRESTO:SCRIPT:BEGIN/END), evaluated by the final expression pass, then comments replaced with `<script>` tags.
- Channel API validates Bearer tokens, enforces scope matching (channel:{moduleName}).
- Action tokens follow a non-negotiable two-phase prepare/execute pattern. Never simplify this away.

## Related Repositories

- **hypermediaapp.com** (/home/jaredef/hypermediaapp.com) — v1 SaaS platform with original @htx/engine, visual builder, JSX showcase, trading dashboard
- **hypermediaapp.org** (/home/jaredef/hypermediaapp.org) — documentation site + white paper + companion essay
- **presto-engine** (/home/jaredef/presto-engine) — previous iteration of the engine
- **hypermedia-app** — upstream engine package (GitHub: hypermediacms/hypermedia-app)

## The White Paper

At `/home/jaredef/hypermediaapp.org/.whitepaper/htx-architecture.md`
Companion essay at `/home/jaredef/hypermediaapp.org/.whitepaper/thinking-in-presto.md`
