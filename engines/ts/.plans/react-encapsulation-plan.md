# React Encapsulation Proof — Master Plan

**Status:** IN PROGRESS
**Date:** 2026-04-05

## Thesis

If the REST representation can enclose any client-side architecture (§4.9), then we can run actual React + React Query inside a bounded region of a PRESTO page, with the surrounding content server-rendered at Layer 0. Both coexist. Both work. The developer sees both and chooses.

## What We're Proving

1. React (the DO style) can operate inside a PRESTO representation
2. React Query (a bridging technology) functions correctly in the bounded region
3. The surrounding page retains all Layer 0 properties (cacheability, no JS, server authority)
4. The escape hatch is visible: the same data, resolved at the surface, zero JavaScript
5. The developer can adopt incrementally — start with the island, surface when ready

## Implementation: React Query Island

A single page with two sections:
- TOP: Server-rendered post list via htx:data (Layer 0, zero JavaScript)
- BOTTOM: React Query island fetching the same data from the channel API (Layer 5)

Both show the same posts. Both work. The developer sees the difference.

## Phases

### Phase 1: Add React + React Query to presto-ts
- Install react, react-dom, @tanstack/react-query as dependencies
- Create a build script that bundles the island component
- The island is a self-contained JS file that mounts into a prepared div

### Phase 2: Channel API Data Endpoint
- Ensure the builder channel handler (or a new one) serves post data as JSON
- The React Query island fetches from /api/channel/{module}/posts
- Token-scoped access via htx:grant

### Phase 3: The Island Component
- A React component using useQuery to fetch posts
- Loading state, error state, refetch button — the full React Query DX
- Mounts into a div#react-island on the page

### Phase 4: The Encapsulation Page
- /encapsulation/react-query — the proof page
- Top half: htx:data + htx:each (Layer 0, complete, zero JS)
- Bottom half: React island with React Query (Layer 5, bounded)
- Side-by-side "what dissolved" when surfacing
- The escape hatch: remove the island, the top half still works

### Phase 5: Verification
- Confirm Layer 0 section has zero JavaScript
- Confirm React island loads and fetches correctly
- Confirm both show the same data
- Confirm the page is cacheable (ETag on the Layer 0 content)
- Confirm the island can be removed without affecting the rest
- Document findings: does the encapsulation hold?
