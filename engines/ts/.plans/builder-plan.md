# PRESTO Builder — Visual Page Editor Master Plan

**Status:** IN PROGRESS
**Date:** 2026-04-05

## Summary

Webflow-style visual editor that produces .htx templates. Runs on the same engine it builds for. The fractal PRESTO pattern.

## Phases

### Phase 1: Data Layer + Builder Module
- SQLite schema (project, page tables)
- Builder channel handler (save, load, preview, export)
- Preview endpoint calls executePipeline directly

### Phase 2: Editor Shell + Layout
- Three-panel layout (palette, canvas, properties)
- Project/page list pages
- Canvas iframe with preview.html
- Editor CSS

### Phase 3: Source Editor + Preview Loop
- SourceEditor class with signals
- PostMessage bridge to iframe
- Debounced preview cycle (source → pipeline → iframe)
- htx:grant for channel token

### Phase 4: Component Palette + Drag-and-Drop
- Registry reader with props extraction
- Categorized component list
- Drag from palette → insert htx:component into source
- Raw HTML element insertion

### Phase 5: Property Panel + Selection
- Canvas click → select component
- Property panel with typed editors
- Component tree panel
- Undo/redo

### Phase 6: Persistence + Export
- Auto-save (2s debounce)
- Load on page entry
- Export as .htx file download
- New project/page dialogs
- Starter templates

### Phase 7: Polish
- Keyboard shortcuts
- Resizable panels
- Source view toggle
- Responsive preview breakpoints
- Full test suite
