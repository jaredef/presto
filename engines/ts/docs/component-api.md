# Component API Reference

## Layer 0 — Pure HTML

### Button
```html
<htx:component src="/ui/button.htx" variant="default" size="md" type="button">Label</htx:component>
```
| Prop | Default | Options |
|------|---------|---------|
| variant | "default" | default, secondary, destructive, outline, ghost |
| size | "md" | sm, md, lg |
| type | "button" | button, submit, reset |
| disabled | "" | "disabled" |

### Input
```html
<htx:component src="/ui/input.htx" label="Email" type="email" name="email" placeholder="you@example.com" />
```
| Prop | Default | Description |
|------|---------|-------------|
| label | "" | Field label text |
| type | "text" | Input type (text, email, password, number, etc.) |
| name | "" | Form field name |
| placeholder | "" | Placeholder text |
| value | "" | Initial value |
| required | "" | Set to "required" to make required |

### Textarea
```html
<htx:component src="/ui/textarea.htx" label="Bio" name="bio" rows="6" />
```
| Prop | Default | Description |
|------|---------|-------------|
| label | "" | Field label |
| name | "" | Form field name |
| placeholder | "" | Placeholder |
| rows | "4" | Visible rows |
| required | "" | "required" to make required |

### Select
```html
<htx:component src="/ui/select.htx" label="Status" name="status">
  <option value="draft">Draft</option>
  <option value="published">Published</option>
</htx:component>
```
| Prop | Default | Description |
|------|---------|-------------|
| label | "" | Field label |
| name | "" | Form field name |
| required | "" | "required" to make required |

### Card
```html
<htx:component src="/ui/card.htx" title="Title" description="Subtitle">Content</htx:component>
```

### Badge
```html
<htx:component src="/ui/badge.htx" variant="secondary">Status</htx:component>
```
Variants: default, secondary, destructive, outline

### Alert
```html
<htx:component src="/ui/alert.htx" variant="warning" title="Warning">Details here.</htx:component>
```
Variants: info, warning, error, success

### Avatar
```html
<htx:component src="/ui/avatar.htx" src="/img/user.jpg" initials="JF" size="lg" />
```
Sizes: sm, md, lg

### Form
```html
<htx:component src="/ui/form.htx" action="create" type="post">
  <!-- Input components here -->
</htx:component>
```
| Prop | Default | Description |
|------|---------|-------------|
| action | "create" | create, update, delete |
| type | "" | Resource type (table name) |
| record | "" | Record ID (for update/delete) |
| method | "post" | HTTP method |

Automatically generates a signed htx:action token.

### Other Layer 0
- **Checkbox** — label, name, value, checked
- **Radio** — label, name, value, checked
- **Separator** — orientation (horizontal/vertical)
- **Skeleton** — width, height, variant (line/circle/rect)
- **Table** — striped, slot for thead/tbody
- **Pagination** — total, perPage, currentPage, baseUrl
- **Breadcrumb** — separator, slot for items
- **Nav** — orientation (horizontal/vertical), slot for links
- **Sidebar** — width, slot for content

---

## Layer 2 — Scoped Behavior

### Dialog
```html
<htx:component src="/ui/dialog.htx" trigger="Open" title="Title" description="Subtitle">
  <p>Dialog body content</p>
</htx:component>
```
Features: ESC key close, backdrop click close, focus management.

### Tabs
```html
<htx:component src="/ui/tabs.htx" active="0">
  <button role="tab">Tab 1</button>
  <button role="tab">Tab 2</button>
  <div role="tabpanel">Panel 1</div>
  <div role="tabpanel">Panel 2</div>
</htx:component>
```
Features: ARIA roles, keyboard navigation (ArrowLeft/ArrowRight).

### Dropdown
```html
<htx:component src="/ui/dropdown.htx" trigger="Actions" align="left">
  <a class="ui-dropdown-item" href="#">Edit</a>
  <a class="ui-dropdown-item" href="#">Delete</a>
</htx:component>
```
Features: Click outside close, item click close.

### Accordion
```html
<htx:component src="/ui/accordion.htx" multiple="false">
  <div class="ui-accordion-item">
    <button class="ui-accordion-trigger">Section 1</button>
    <div class="ui-accordion-content">Content 1</div>
  </div>
</htx:component>
```

### DataTable
```html
<htx:component src="/ui/data-table.htx" type="post" where="status='published'" columns="title,status">
  <td><htx:v>row.title</htx:v></td>
  <td><htx:v>row.status</htx:v></td>
</htx:component>
```
Integrates with htx:data for server-resolved queries.

### Other Layer 2
- **Tooltip** — text, position (top/bottom/left/right)
- **Popover** — trigger, position
- **Toast** — position, duration (global `toast(message, variant)` function)
- **Switch** — label, name, checked (dispatches "switch" custom event)
- **Slider** — min, max, value, step, name, label
- **CopyButton** — text, label, copied
- **SearchInput** — placeholder, url, debounce
- **CommandPalette** — placeholder, hotkey (Cmd/Ctrl + key)

---

## Layer 3-4 — Channel Integration

### LiveFeed
```html
<htx:component src="/ui/live-feed.htx" module="feed" maxItems="50" />
```
Materializes a channel grant. Connects via WebSocket. Prepends incoming messages.

### PresenceIndicator
```html
<htx:component src="/ui/presence.htx" module="presence" />
```
Shows online user count and avatars via channel.

### LiveCounter
```html
<htx:component src="/ui/live-counter.htx" module="counter" label="viewers" initial="0" />
```
Real-time counter using signals + channel. Updates surgically.

### CollabIndicator
```html
<htx:component src="/ui/collab-indicator.htx" module="collab" />
```
Shows who else is editing. Colored avatar badges from channel data.
