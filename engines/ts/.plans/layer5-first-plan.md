# Layer 5 First: Meet React Developers at Their Home Depth

**Status:** IN PROGRESS
**Date:** 2026-04-05

## Orientation

Don't pitch the surface. Meet the developer at Layer 5 — their home depth — with the full React mental model: components, props, state, effects, client rendering. Then demonstrate the specific moments where surfacing dissolves a compensation they're currently paying for.

The developer discovers the surface through the escape hatch, not through evangelism.

## Structure

Each recipe starts at Layer 5 (the React developer's comfort zone) and demonstrates a specific escape hatch moment where surfacing removes a compensation.

## Phases

### Phase 1: The React Experience at Layer 5
- Full SPA-style interactive app inside a PRESTO representation
- Components, signals (as React-like state), client rendering
- Prove: your mental model works here

### Phase 2: The First Escape — Data Doesn't Need the Client
- The app fetches data via channelFetch (Layer 4 pattern)
- Escape: surface the data page to Layer 0 with htx:data
- SSR, React Query, loading states dissolve

### Phase 3: The Second Escape — Forms Don't Need JavaScript
- The app has a form with client validation + submit handler
- Escape: surface the form to Layer 0 with htx:action
- React Hook Form, useMutation, Server Actions dissolve

### Phase 4: The Third Escape — Auth Doesn't Need Route Guards  
- The app has a protected page with client-side auth check
- Escape: surface auth to Layer 0 with htx:auth
- NextAuth, route guards, useSession dissolve

### Phase 5: The Fourth Escape — Most Pages Don't Need React
- The app has content pages rendered client-side
- Escape: surface them to Layer 0 as pure templates
- SSR, hydration, code splitting dissolve
- React remains only in the bounded region that needs it
