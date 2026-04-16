# PRESTO Module Kit — Master Plan

**Status:** COMPLETE
**Date:** 2026-04-05

## Position in the Stack

```
Engine          — no opinions, raw interfaces
Module Kit      — server-side behavioral opinions (THIS)
Library         — client-side visual opinions (presto-ui)
Framework       — full-stack conventions (Hypermedia App)
```

## 12 Modules

### Phase 1: Foundation (no dependencies)
- request-id — UUID per request, X-Request-ID header, context injection
- logger — method/path/status/time logging, configurable format
- cors — Access-Control headers, OPTIONS preflight handling
- security — Security headers (X-Content-Type-Options, CSP, HSTS, etc.)

### Phase 2: Session Infrastructure
- session — Stateless HMAC-signed cookie sessions
- flash — One-time messages (consumed on read)
- rate-limit — In-memory sliding window, 429 responses
- cache — Cache-Control headers, ETag generation, 304 responses

### Phase 3: Auth Extraction
- auth — Extract from framework. Sessions + passwords + user table + context

### Phase 4: Runtime Modules
- error-handler — Custom error pages, dev stack traces, 404/500 templates
- health — /healthz endpoint with uptime, memory, custom checks
- static-assets — Cache busting, content hashing, versioned URLs

### Phase 5: Integration
- Barrel export, composition tests, framework migration

## Prerequisite
Wire executeMiddleware into engine.handle() — the infrastructure exists but was never connected.

## Pattern
Every module: factory function → HtxModule → registers middleware/context providers/channel handlers.
