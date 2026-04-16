# PRESTO-UI Master Plan

**Status:** PLANNED
**Date:** 2026-04-05

## Summary

A curated Tier 2 component library within the PRESTO architectural style. 34 components across 4 progressive layers. Signal-based reactivity (~3KB). shadcn-style copy-to-project installation. Zero engine modifications required.

## Design Principles

1. Components are .htx files — no build step, no compilation, no framework
2. The pipeline is the runtime — component expansion at Stage 7, directive resolution at Stages 9-22
3. Progressive escape — library constraints are removable per feature without leaving the architecture
4. Layer 0 is the default — no JavaScript where none is needed
5. Components are owned by the developer — copied, not imported

## Phases

### Phase 1: Signal System Foundation
- `presto-signals.js`: signal(), computed(), effect(), bind(), bindAttr(), channel()
- Unit tests for reactivity core
- DOM binding tests

### Phase 2: Layer 0 Components (18)
- Button, Input, Textarea, Select, Checkbox, Radio, Card, Badge, Separator, Avatar, Alert, Skeleton, Table, Pagination, Breadcrumb, Nav, Sidebar, Form (basic)
- Base CSS with custom properties
- Dark theme variant

### Phase 3: Form + Action Integration
- Form component with htx:action integration
- Signed mutation token injection
- Client-side validation overlay (Layer 2 optional)

### Phase 4: Layer 2 Components (13)
- Switch, Slider, Dialog, Dropdown, Popover, Tooltip, Toast, Tabs, Accordion, CommandPalette, DataTable, SearchInput, CopyButton
- Signal integration where appropriate
- ARIA + keyboard navigation

### Phase 5: Layer 3-4 Components (4)
- LiveFeed, PresenceIndicator, LiveCounter, CollabIndicator
- htx:grant + channel() integration

### Phase 6: CLI Tool
- `presto add/list/init` commands
- Dependency resolution
- Config file (.presto-ui.json)

### Phase 7: Documentation
- "Thinking in PRESTO" developer guide
- Component API reference
- Progressive escape guide
- Migration from React guide

### Phase 8: Verification + Polish
- Full test suite
- Cross-browser testing
- Performance benchmarks
- Accessibility audit
