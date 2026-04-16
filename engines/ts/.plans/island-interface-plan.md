# Standard Island Interface — Master Plan

**Status:** PLANNED
**Date:** 2026-04-05

## Thesis

Any React npm package should mount into a bounded region of a PRESTO representation via a standard protocol. The developer uses the package as documented. The interface handles the depth.

## Architecture

Composes within the existing engine — no new directives, no seed modifications:
- defineIsland() SDK for island authors (client-side)
- Island module (context provider for manifest)
- island.htx component (renders mount div + bootstrap)
- CLI build command (bundles islands)

## Phases

### Phase 1: defineIsland() SDK + Registry
- Client-side define function with mount/unmount protocol
- window.__prestoIslands registry (replaces per-island globals)
- Server-side manifest scanner
- Auto-mount: islands self-mount when data-island elements exist

### Phase 2: Island Module (Context Provider)
- createIslandModule() factory function
- Scans islands dir, caches manifest at boot
- Injects __islands into template context

### Phase 3: island.htx Component
- Mount div with data-island attribute
- Slot for server-rendered fallback
- htx:script bootstrap that loads bundle + reads data/token bridges
- Convention: template#island-data-{name} and input#island-token-{name}

### Phase 4: CLI Build Command
- bun cli/index.ts build-islands
- Scans islands/ dir, bundles each .tsx with Bun.build()
- Writes islands.json manifest

### Phase 5: Migration + Documentation
- Refactor both proofs to standard interface
- docs/island-interface.md specification
- Encapsulation index page
