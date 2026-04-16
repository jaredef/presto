# PRESTO Builder — User Guide

## What It Is

The PRESTO Builder is a visual web application editor with an AI assistant. You build pages two ways at once:

- **Drag and drop** components from the palette onto the canvas
- **Type in the chat** to describe what you want the AI to build

Both methods edit the same page. Both see the same preview. You can switch between them freely — drag a card, then ask the AI to connect it to your database, then visually adjust the layout, then ask the AI to add authentication. The visual editor and the AI operate on the same file.

The output is a `.htx` template file that any PRESTO engine can serve. No build step. No deployment pipeline. Save the file and it's live.

---

## Getting Started

### 1. Open the Builder

Navigate to the builder URL. You'll see a project list. Click a project, then click a page to open the editor.

### 2. The Editor Layout

```
┌──────────────────────────────────────────────────────┐
│ Toolbar: page name, save, preview modes, export       │
├──────────┬───────────────────────┬───────────────────┤
│ Component│                       │ Properties        │
│ Palette  │   Live Preview        │ Panel             │
│          │   (your page)         │                   │
├──────────┴───────────────────────┴───────────────────┤
│ AI Chat                                               │
│ [suggestion chips]                                    │
│ [type here...]                                 [Send] │
└──────────────────────────────────────────────────────┘
```

- **Left:** Component palette — drag components onto the canvas
- **Center:** Live preview — shows your page as it will appear to users
- **Right:** Property panel — edit the selected component's settings
- **Bottom:** AI chat — describe what you want in plain English

### 3. Your First Page

**Option A — Start visually.** Drag a heading from the Content section of the palette. Drag a Card from the Layout section. Click the card in the preview to select it. Change its title in the property panel.

**Option B — Start with AI.** Click one of the suggestion chips at the bottom (Blog, Dashboard, CRUD, Landing, Auth, Search). Or type your own request: "Create a landing page with a hero section and three feature cards." The AI generates the page and the preview updates immediately.

**Option C — Combine both.** Ask the AI to create a blog post list. Then drag a Badge component onto one of the cards. Then ask the AI: "Connect the badge to show the post status."

---

## Visual Editing

### Dragging Components

The left palette has components organized by category:

| Category | Components |
|----------|-----------|
| **Layout** | Card, Separator, Nav, Sidebar |
| **Content** | Heading 1, Heading 2, Paragraph, Image, Link |
| **Display** | Badge, Alert, Avatar, Skeleton |
| **Form** | Button, Input, Textarea, Select, Checkbox, Form |
| **Interactive** | Dialog, Tabs, Accordion, Dropdown, Tooltip, Slider, Switch |
| **Data** | Table, DataTable, Pagination |

Drag any component from the palette onto the canvas. It appears in the preview.

### Selecting and Editing

Click any component in the preview to select it. The property panel on the right shows its editable properties:

- **Text fields** for titles, labels, placeholders
- **Dropdowns** for variants (default, primary, destructive) and sizes (sm, md, lg)
- **Content area** for the slot (what goes inside the component)

Changes appear in the preview immediately.

### Deleting

Select a component and click the **Delete** button in the property panel. Or press the **Delete** key.

### Source View

Click the **Source** button in the toolbar to see the raw `.htx` template. You can edit it directly. Click **Visual** to switch back to the canvas. Both views edit the same file.

### Responsive Preview

The toolbar has three buttons: **Desktop**, **Tablet**, **Mobile**. These resize the preview canvas to common breakpoints so you can see how your page looks on different devices.

---

## AI Chat

### Opening the Chat

The chat panel is collapsed at the bottom of the editor. Click the **▲ AI** bar to expand it. Or press **Cmd+L** (Mac) / **Ctrl+L** (Windows) to open and focus the chat input.

### What You Can Ask

The AI understands your page, your components, and your database. Here are things you can ask:

**Create content:**
- "Create a blog post list showing title and status"
- "Add a hero section with a heading and subtitle"
- "Create a contact form with name, email, and message fields"

**Connect to data:**
- "Query the posts table and display the results in cards"
- "Add a search form that filters posts"
- "Show the 5 most recent published posts"

**Add behavior:**
- "Add authentication — show different content for logged in vs guest users"
- "Add a form that creates a new post with a signed mutation token"
- "Add pagination to the post list"

**Modify existing content:**
- "Change the card layout to a 3-column grid"
- "Make the heading larger"
- "Add a badge showing the post status to each card"
- "Wrap the list in a sidebar layout"

**Complex patterns:**
- "Create a full CRUD interface for posts — list, detail, create, edit, delete"
- "Add a dashboard with stat cards showing total posts, published count, and drafts"
- "Create a settings page with toggle switches"

### How It Works

When you send a message:

1. The AI reads your current page and your message
2. It generates a modified version of your page
3. The preview updates to show the changes
4. A green **✓ Applied** badge appears on the AI's response
5. Click **View changes** to see exactly what was added or removed

### Suggestion Chips

After each response, the AI shows suggestion chips based on your current page:

- If you have data but no iteration: "Add iteration to display the data"
- If you have a form but no mutation token: "Add a mutation token for form submission"
- If you have no authentication: "Add authentication gating"

Click any chip to send it as your next message.

### Starting from Scratch

When your page is empty, the chat shows starter chips:

- 📝 **Blog** — post list with titles and read-more links
- 📊 **Dashboard** — stat cards with counts
- 📋 **CRUD** — list + create + edit + delete
- 🏠 **Landing** — hero section with feature cards
- 🔐 **Auth** — logged-in vs guest views
- 🔍 **Search** — search form with filtered results

Click any starter to generate a complete page from that pattern.

---

## Working with Both

The visual editor and the AI chat share the same page. This means:

**Visual → Chat:** Drag a Card onto the canvas. The AI sees this. Type "connect this card to the posts database." The AI wraps it in data directives and the card now shows real data.

**Chat → Visual:** Ask the AI to create a form. The form appears in the preview. Click the title input and change its label in the property panel. Click the submit button and change its text.

**Back and forth:** Ask the AI to create a post list. Visually rearrange the cards into a grid. Ask the AI to add a sidebar with tag filtering. Drag a Badge into the sidebar. Ask the AI to connect the badge to the tag data.

Every change — whether from dragging, typing in the property panel, or chatting with the AI — updates the same page. The preview shows the result. The undo stack tracks everything.

---

## Saving and Exporting

### Auto-Save

The builder auto-saves your page 2 seconds after your last change. The toolbar shows:
- **Loaded** — page loaded from the database
- **Unsaved** — you have changes not yet saved
- **Saving...** — save in progress
- **Saved** — all changes saved

### Manual Save

Press **Cmd+S** (Mac) / **Ctrl+S** (Windows) to save immediately. Or click the **Save** button in the toolbar.

### Export

Click the **Export** button to download your page as a `.htx` file. This file can be placed in any PRESTO engine's template directory and served immediately. No build step. No compilation. The file IS the page.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Cmd+L** | Focus the AI chat input |
| **Cmd+S** | Save the page |
| **Cmd+Z** | Undo the last change (visual or chat) |
| **Cmd+Shift+Z** | Redo |
| **Enter** | Send chat message |
| **Escape** | Collapse the chat panel |
| **Delete** | Remove the selected component |

---

## Understanding the Output

The builder produces `.htx` template files. These are HTML files with special directives that the PRESTO engine resolves. Here's what the directives do:

| What You See | What It Means |
|-------------|---------------|
| `<htx:data type="post" ...>` | "Query the database for posts" |
| `<htx:each items="posts" as="post">` | "Repeat this for each post" |
| `<htx:v>post.title</htx:v>` | "Show the post's title here" |
| `<htx:component src="/ui/card.htx" ...>` | "Use the Card component here" |
| `<htx:if test="condition">` | "Show this only if the condition is true" |
| `<htx:auth>` | "Show this only to logged-in users" |
| `<htx:action name="create" type="post">` | "This page can create posts" |

You don't need to understand these to use the builder — the visual editor and AI handle them. But if you want to learn, toggle to Source view and read the template. Every directive is visible and human-readable.

---

## Tips

**Start with AI, refine visually.** The AI is fastest for creating the initial structure and connecting data. The visual editor is fastest for adjusting layout, spacing, and visual details.

**Be specific in chat.** "Add a post list" works, but "Add a list of the 5 most recent published posts, each in a Card component showing the title and a status badge" works better.

**Use the diff.** After the AI makes changes, click "View changes" to see exactly what was added or removed. This helps you understand the template and catch anything unexpected.

**Try Source view.** Toggle between Visual and Source to see how the template corresponds to the preview. The more you read `.htx` templates, the more precisely you can direct the AI.

**Undo freely.** Cmd+Z undoes any change — whether from the visual editor or the AI. You can experiment without risk.

**Export early.** Export your page and open it in a text editor to see the clean `.htx` output. The file is self-contained and human-readable. No build artifacts. No minified code. Just HTML with directives.
