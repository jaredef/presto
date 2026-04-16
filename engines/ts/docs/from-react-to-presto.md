# From React to PRESTO: A Reorientation Guide

Your path is not from React to PRESTO. It is from the compensating stack to the correct layer — discovering, at each step, that the property you were working to recover was available by default at the layer where the architecture provides it natively.

## Rendering

| React Technology | What It Compensates For | PRESTO Layer | PRESTO Approach |
|-----------------|------------------------|-------------|-----------------|
| SSR | Missing complete representations | Layer 0 | Server rendering is the default. The template is the page. |
| SSG | SSR performance cost | Layer 0 + Cache-Control | Same template. Standard HTTP cache headers. |
| ISR | SSG staleness | Layer 0 + HTTP semantics | `stale-while-revalidate`. Predates React by 20 years. |
| Streaming SSR | SSR latency | Layer 0 | Browser renders HTML as it arrives. Chunked transfer. |
| React Server Components | Lost server data access | Layer 0 | Every template has data access. No "use client" needed. |

## Hydration

| React Technology | What It Compensates For | PRESTO Layer | PRESTO Approach |
|-----------------|------------------------|-------------|-----------------|
| hydrate/hydrateRoot | Server/client DOM split | Does not exist | Scripts enhance complete documents. No reconciliation. |
| Selective Hydration | Hydration performance | Does not apply | Each htx:script is independent by construction. |
| Resumability (Qwik) | Hydration cost | Layer 2 | Latent binding. The DOM IS the state. No serialization. |

## Routing

| React Technology | What It Compensates For | PRESTO Layer | PRESTO Approach |
|-----------------|------------------------|-------------|-----------------|
| React Router | Lost server navigation | Layer 0 | Filesystem routing. File path = URL. Zero config. |
| Next.js file conventions | Route configuration | Layer 0 | One .htx file per route. No special conventions. |
| Client navigation | Full page reload cost | Layer 1 | htmx swaps HTML fragments. Server authority preserved. |

## State Management

| React Technology | What It Compensates For | PRESTO Layer | PRESTO Approach |
|-----------------|------------------------|-------------|-----------------|
| Redux/Zustand/Jotai | Missing shared state | Layer 0 | The document IS the state. Scripts read from DOM. |
| React Query/SWR | Lost server data delivery | Layer 0/4 | htx:data for initial. channelFetch for dynamic. |
| Context/Providers | Missing ambient context | Layer 0 | Module context providers. Expressions access directly. |

## Data Fetching

| React Technology | What It Compensates For | PRESTO Layer | PRESTO Approach |
|-----------------|------------------------|-------------|-----------------|
| getServerSideProps | Lost server data resolution | Layer 0 | htx:data directive. Data and markup in same file. |
| Server Actions | Need for server mutations | Layer 0 | htx:action. Signed tokens. Standard POST. |
| API Routes/tRPC | Need for server endpoints | Layer 4 | Channel handlers. Token-scoped. Module-registered. |

## Build Tooling

| React Technology | What It Compensates For | PRESTO Layer | PRESTO Approach |
|-----------------|------------------------|-------------|-----------------|
| webpack/Vite/turbopack | Cost of shipping full app | None | No build step. Edit, save, reload. |
| Babel/SWC/TSC | Language transformation gap | None | HTML templates + standard JavaScript. |
| Tree shaking | Bundle bloat | None | Additive by design. Layer 0 = 0 KB JS. |

## Performance

| React Technology | What It Compensates For | PRESTO Layer | PRESTO Approach |
|-----------------|------------------------|-------------|-----------------|
| Code splitting | Full app shipped at once | Layer 0 | Each page response is self-contained. |
| Suspense/loading states | Client-side fetch latency | Layer 0 | Page arrives complete. Nothing to wait for. |
| next/image | Image optimization complexity | Infrastructure | Middleware module. Standard `<img>` tags. |

## Security

| React Technology | What It Compensates For | PRESTO Layer | PRESTO Approach |
|-----------------|------------------------|-------------|-----------------|
| API middleware auth | Lost server authority | Layer 0 | Security through absence. Unprovided = nonexistent. |
| Route guards | All routes in client bundle | Layer 0 | Server resolves auth. Template never sent if unauthorized. |
| "use server"/taint | Server code leaking to client | Layer 0 | Physical separation. Templates are server files. |

## The Compensation Stack

Each step compensates for the problem the previous step introduced:

1. DO renders on the client → empty shell
2. Shell has no content → SSR
3. SSR is slow → SSG
4. SSG is stale → ISR
5. SSR is non-interactive → hydration
6. Hydration is expensive → selective hydration, streaming, resumability
7. Client needs data → API routes, React Query, server actions
8. Data needs caching → SWR, cache invalidation, optimistic updates
9. All code ships → code splitting, tree shaking
10. All routes exist → route guards
11. Server/client share code → "use server", taint APIs

Each is unnecessary when the architectural encapsulation is correct: REST as the outer style, DO as the inner style when needed, with the representation as the boundary.

## Live Demonstrations

Every reorientation has a running demo page:

- `/reorientation/ssr` — Server rendering as default
- `/reorientation/ssg` — Cache-Control instead of build step
- `/reorientation/isr` — HTTP cache semantics instead of ISR
- `/reorientation/rsc` — Every template is a server component
- `/reorientation/hydration` — Interactive components with no hydration
- `/reorientation/resumability` — DOM as state, no serialization
- `/reorientation/routing` — Filesystem routing, zero config
- `/reorientation/state` — Document as shared state
- `/reorientation/context` — Module providers, no wrapping
- `/reorientation/server-actions` — htx:action with signed tokens
- `/reorientation/api` — Channel handlers with Bearer tokens
- `/reorientation/build` — Zero dependencies, no build step
- `/reorientation/splitting` — Per-page responses, nothing to split
- `/reorientation/security` — Absence-based security model
