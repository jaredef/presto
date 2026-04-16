# The Document Grammar: Structural Composition in the PRESTO Design Space

## The Observation

The components in the builder palette are not a flat list of widgets. They are a structural grammar for how hypermedia documents compose. Each element carries semantic meaning that affects accessibility, SEO, document outline, data flow, and capability boundaries. The builder should understand this grammar and guide the developer's composition within it.

## The Grammar

A PRESTO page has a defined structural hierarchy. Each level has rules about what it contains and what contains it.

### Level 0: Page

The root. One per URL. Has a layout (from `_layout.htx` or `htx:layout`). The layout provides the document landmarks (header, main, footer). The page content fills the `__content__` slot.

### Level 1: Landmarks

The top-level structural regions of the document. HTML defines these as landmark roles for accessibility.

| Element | Role | Contains | Rules |
|---------|------|----------|-------|
| `<header>` | Banner | Nav, heading, branding | One per layout. First landmark. |
| `<main>` | Main | Sections, content blocks | One per page. Primary content. |
| `<footer>` | Content Info | Links, metadata, copyright | One per layout. Last landmark. |

### Level 2: Regions

Structural divisions within landmarks. These create the document outline.

| Element | Role | Contains | Rules |
|---------|------|----------|-------|
| `<nav>` | Navigation | Links, menus | Inside header or aside. Declares navigation structure. |
| `<section>` | Region | Heading + content blocks | Inside main. Each section has a heading (h2-h6). |
| `<aside>` | Complementary | Content blocks, nav | Beside main or inside section. Supplementary content. |
| `<article>` | Article | Heading + content + metadata | Self-contained. Could be extracted independently (RSS, share). |

### Level 3: Content Blocks

The building blocks within regions. These carry content, data, and interaction.

| Element | Type | Contains | Affordance |
|---------|------|----------|------------|
| Card | Container | Title, description, slot | Groups related content visually and semantically |
| Data List | Data-bound | htx:data + htx:each + items | Renders database records as repeated blocks |
| Form | Mutation | Inputs + htx:action | Declares what writes the page can perform |
| Alert | Notification | Title + body | Conveys status information (info, warning, error, success) |
| Table | Tabular | Rows, columns | Structured data in rows and columns |

### Level 4: Inline Elements

Elements within content blocks. These carry text, links, badges, and interactive controls.

| Element | Type | Contains | Affordance |
|---------|------|----------|------------|
| Heading | Structure | Text | h1-h6. Creates document outline hierarchy. |
| Paragraph | Text | Inline text, expressions | Body text. |
| Link | Navigation | Text, inline elements | Navigates to another representation. |
| Button | Action | Text | Triggers a behavior (submit, toggle, navigate). |
| Badge | Metadata | Text | Compact status indicator. |
| Input | Field | Value | Captures user input within a form. |
| Image | Media | — | Visual content. |

### Level 5: Capability Boundaries

Regions where the depth changes — where Layer 5 islands, auth gates, or conditional rendering apply.

| Element | Type | Contains | Affordance |
|---------|------|----------|------------|
| Island | Layer 5 mount | React/Vue/Svelte component | Bounded region for DO architecture |
| htx:auth | Auth gate | Content blocks | Visible only to authenticated users |
| htx:unauth | Auth gate | Content blocks | Visible only to unauthenticated users |
| htx:if | Conditional | Content blocks | Visible only when condition is true |

## Composition Rules

1. **Landmarks contain regions.** A `<header>` contains `<nav>`. A `<main>` contains `<section>` and `<aside>`. A `<footer>` contains links and metadata.

2. **Regions contain content blocks.** A `<section>` contains cards, data lists, forms, and alerts. An `<aside>` contains supplementary content blocks.

3. **Content blocks contain inline elements.** A card contains headings, paragraphs, badges, and buttons. A form contains inputs, textareas, and selects.

4. **Capability boundaries can wrap any level.** An `htx:auth` block can wrap a section, a content block, or an inline element. An island can replace any content block.

5. **Data binding creates repetition.** `htx:data` + `htx:each` within a region repeats a content block for each record. The repeated block follows the same composition rules.

6. **Headings define hierarchy.** Each section should start with a heading. The heading level (h2 inside main, h3 inside section, h4 inside card) creates the document outline.

## Implementation in the Builder

### Structured Palette

The palette organizes components by structural level, not by visual category:

```
📐 Structure
  ├─ Section
  ├─ Article
  ├─ Aside
  └─ Separator

📦 Content Blocks
  ├─ Card
  ├─ Data List (htx:data + htx:each)
  ├─ Form (htx:action)
  ├─ Alert
  └─ Table

📝 Text & Media
  ├─ Heading (h1-h6)
  ├─ Paragraph
  ├─ Link
  ├─ Image
  └─ Badge

🎛️ Inputs
  ├─ Input
  ├─ Textarea
  ├─ Select
  ├─ Checkbox
  └─ Button

🔒 Boundaries
  ├─ Auth Gate
  ├─ Conditional
  └─ Island

🎨 Layout Helpers
  ├─ Grid (2/3/4 columns)
  ├─ Flex Row
  ├─ Container
  └─ Spacer
```
