# Hypermedia App Framework — Master Plan

**Status:** COMPLETE
**Date:** 2026-04-05

## Summary

Tier 3 curating framework built on presto-ts v3 + presto-ui. Conventions, auth, scaffolding, CRUD generator, dev server. Every opinion teaches the architecture. Every default has an escape hatch.

## Phases

### Phase 1: Config + Server Wrapper
- HypermediaAppConfig type + defaults
- createServer(config) thin wrapper
- Tests for config merging + server construction

### Phase 2: Auth Module
- HMAC-signed cookie sessions (stateless)
- Password hashing via Bun.password (scrypt)
- AuthMiddleware + AuthContextProvider
- User table auto-creation

### Phase 3: Scaffold + create-hypermedia-app CLI
- Interactive prompts (name, auth, examples)
- Generates full project structure
- Copies presto-ui starter components
- Layer recommendation comments in every template

### Phase 4: Dev Server
- File watching + hot reload
- Dev error pages with stack traces
- Request logging middleware

### Phase 5: CRUD Generator
- `hypermedia generate crud post title:text body:text`
- Generates: list, detail, create, edit, delete pages
- Schema + seed generation

### Phase 6: Integration + Polish
- Wire CLI commands (dev, generate, seed)
- End-to-end integration test
- README documentation
