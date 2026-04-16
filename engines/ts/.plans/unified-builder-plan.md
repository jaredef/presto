# Unified Builder — Master Implementation Plan

**Status:** PLANNED
**Date:** 2026-04-06

## What Exists

- Visual builder at /editor (palette, canvas, property panel, save/load)
- Preview endpoint (/api/preview) resolving .htx through 22-stage pipeline
- Builder channel handler (save, load, export, project/page CRUD, registry, posts)
- Component library (34 presto-ui components)
- Island protocol (defineIsland, island.htx, build-islands CLI, 10 islands)
- Module kit (13 modules active on demo server)
- Signal system for reactive client state
- Template authoring context (src/llm/template-context.md, ~800 words)

## What's Missing

A chat panel that reads and writes the same source signal the visual builder uses, connected to an LLM with the template authoring context as system prompt.

---

## Phase 1: Chat Panel UI

**Goal:** A collapsible chat panel in the editor with message display, input field, and send button. No LLM yet — messages echo locally to prove the UI works.

### Files to Create

**editor/public/js/chat-panel.js** — Chat UI powered by signals.

State:
- `messages` signal: array of `{ role: "user"|"assistant", content: string, timestamp: number }`
- `input` signal: current input text
- `loading` signal: boolean, true while waiting for AI response
- `collapsed` signal: boolean, panel open/closed

Rendering:
- Message list scrolls to bottom on new message
- User messages right-aligned, assistant messages left-aligned
- Loading indicator ("Thinking...") while waiting
- Markdown-lite rendering for assistant messages (bold, code blocks, line breaks)
- Collapse/expand toggle button in the panel header

Event handlers:
- Send button and Enter key submit the message
- Escape key collapses the panel
- Cmd+L focuses the input (keyboard shortcut)

The chat panel emits a custom event `chat:send` with `{ message, currentSource }` that Phase 2 will handle.

**editor/public/css/chat-panel.css** — Chat panel styles.

- Panel fixed to bottom of the editor grid
- Collapsed state: only header visible (40px)
- Expanded state: 250px height, scrollable message area
- Message bubbles with subtle backgrounds
- Input bar with send button
- Responsive: full width on mobile

### Files to Modify

**editor/pages/editor/[project]/[page]/index.htx** — Add chat panel container below the editor grid.

```html
<!-- After .editor-grid -->
<div id="chat-panel" class="chat-panel collapsed">
  <div class="chat-header">
    <span>AI Assistant</span>
    <button class="chat-toggle">▲</button>
  </div>
  <div class="chat-messages" id="chat-messages"></div>
  <div class="chat-input-bar">
    <input type="text" id="chat-input" placeholder="Describe what you want..." />
    <button id="chat-send" class="ui-btn ui-btn-default ui-btn-sm">Send</button>
  </div>
</div>
```

Add script reference: `<script src="/js/chat-panel.js"></script>`

**editor/public/css/editor.css** — Update editor grid to accommodate chat panel.

### Test Criteria
- Chat panel renders below the editor canvas
- Toggle expands/collapses the panel
- Typing a message and pressing Enter adds it to the message list
- Messages scroll to bottom
- Cmd+L focuses the input
- The `chat:send` event fires with the message and current source

---

## Phase 2: LLM Integration

**Goal:** Connect the chat to an LLM API. The AI receives the template authoring context + component registry + schema + current source + message, and returns modified .htx source.

### Files to Create

**src/llm/claude.ts** — LLM client.

```typescript
export interface LLMRequest {
  systemPrompt: string;
  userMessage: string;
  currentSource: string;
}

export interface LLMResponse {
  message: string;        // The AI's conversational response
  modifiedSource?: string; // The modified .htx source (if the AI changed it)
}

export async function chatWithLLM(request: LLMRequest): Promise<LLMResponse> {
  // POST to Anthropic Messages API
  // Model: claude-sonnet-4-20250514 (or configurable)
  // System: template authoring context + components + schema
  // User: current source + message
  // Parse response: extract conversational text + modified source
}
```

The system prompt is assembled once at server boot:
1. Read `src/llm/template-context.md` — the 16 directives, patterns, rules
2. Read component registry — names and props of all available components
3. Read database schema — table names and column names from the adapter

This static system prompt is ~2,000-3,000 tokens and never changes during the session.

Per-request, the user message includes:
1. The current .htx source (wrapped in a code block)
2. The user's natural language request
3. Instruction: "Return the complete modified .htx source in a ```htx code block, followed by a brief explanation of what you changed."

**src/llm/context-assembler.ts** — Builds the static system prompt at boot.

```typescript
export function assembleSystemPrompt(
  templateContextPath: string,
  componentRegistry: Record<string, any>,
  schema: { tables: { name: string; columns: string[] }[] }
): string {
  // Read template-context.md
  // Append: "## Available Components\n" + formatted registry
  // Append: "## Database Schema\n" + formatted tables
  // Return complete system prompt
}
```

### Files to Modify

**modules/builder.ts** — Add `chat` sub-path to the channel handler.

Since the channel handler is synchronous but LLM calls are async, the chat sub-path returns a job ID, and a second sub-path `chat-result` returns the result when ready. Or simpler: add a dedicated async endpoint in the editor server (like `/api/preview` bypasses the channel for async operation).

Better approach: add `/api/chat` as a dedicated async endpoint in `editor/server.ts`, alongside the existing `/api/preview`. Both bypass the synchronous channel handler for async operations.

```typescript
// In editor/server.ts fetch handler:
if (url.pathname === "/api/chat" && req.method === "POST") {
  const { message, currentSource } = await req.json();
  const response = await chatWithLLM({
    systemPrompt: cachedSystemPrompt,
    userMessage: buildUserMessage(message, currentSource),
    currentSource,
  });
  return Response.json(response);
}
```

**editor/server.ts** — Add `/api/chat` endpoint, assemble system prompt at boot.

### Configuration

```
ANTHROPIC_API_KEY=sk-ant-...  # Required
LLM_MODEL=claude-sonnet-4-20250514      # Optional, default
```

### Test Criteria
- POST to `/api/chat` with message + source returns LLM response
- System prompt includes template context + component registry + schema
- Response contains conversational text and optionally modified source
- API key validation (401 if missing)
- Error handling for LLM API failures

---

## Phase 3: Source Integration

**Goal:** When the AI returns modified source, update the editor's source signal, refresh the preview, and show the diff in the chat panel.

### Files to Create

**editor/public/js/source-diff.js** — Minimal line-by-line diff.

```javascript
function diffLines(oldSource, newSource) {
  // Split both into lines
  // Walk both arrays, identify:
  //   - unchanged lines
  //   - added lines (in new, not in old)
  //   - removed lines (in old, not in new)
  // Return array of { type: "same"|"add"|"remove", line: string }
}

function renderDiff(diff) {
  // Returns HTML with:
  //   added lines in green background
  //   removed lines in red background with strikethrough
  //   unchanged lines in normal text (collapsed if many)
}
```

The diff is displayed inline in the chat panel after the AI's response message. The user sees exactly what changed. This is transparency over the bilateral boundary — the AI's modification to the source representation is visible.

### Files to Modify

**editor/public/js/chat-panel.js** — Wire to LLM endpoint.

On `chat:send`:
1. Add user message to messages list
2. Set loading = true
3. POST to `/api/chat` with `{ message, currentSource: source.value }`
4. On response:
   a. Add assistant message to messages list
   b. If `modifiedSource` is present:
      - Compute diff between current source and modified source
      - Show diff in the chat panel (collapsible)
      - Update `source.value = modifiedSource` (triggers preview loop)
      - Show "Applied" badge on the message
   c. Set loading = false

**editor/public/js/editor-app.js** — Expose `source` signal to chat panel.

The chat panel needs to read `source.value` (to send current source with each message) and write to it (to apply AI modifications). Since both scripts run in the same page, the source signal is exposed on a shared namespace:

```javascript
window.__editorState = { source: source };
```

The chat panel reads `window.__editorState.source.value` and writes to it. The effect that triggers the preview loop fires automatically.

### Test Criteria
- AI response with modified source updates the canvas preview
- Diff displays inline showing added/removed lines
- The property panel reflects changes made by the AI
- Undo (Ctrl+Z) reverts the AI's change
- Multiple AI edits accumulate correctly

---

## Phase 4: Context Awareness

**Goal:** The AI receives rich context — not just the source, but the component registry, database schema, and recent visual edits — enabling contextual suggestions.

### Files to Create

**editor/public/js/context-builder.js** — Assembles per-request context.

```javascript
function buildContext() {
  return {
    currentSource: window.__editorState.source.value,
    recentEdits: getRecentEdits(),    // last 3 visual edits with descriptions
    selectedComponent: getSelected(), // currently selected component (if any)
    pageMetadata: {
      name: document.getElementById('page-name')?.textContent,
      project: document.getElementById('project-slug')?.value,
    },
  };
}

function getRecentEdits() {
  // Read from edit history signal
  // Return: [{ type: "visual", description: "Added Card component", timestamp }]
}

function getSelected() {
  // Read from selectedId signal
  // Return: { name: "card", props: { title: "Hello" }, position: "line 12" } or null
}
```

This context is sent with each chat message. The AI uses it to make contextual suggestions:

- "I see you just added a Card. Want me to connect it to data?"
- "You have a `post` table with title, body, and status columns. Want me to add a post list?"
- "The selected button has variant='default'. Want me to change it to 'primary'?"

### Files to Modify

**modules/builder.ts** — Add `schema` sub-path to channel handler.

```javascript
case "schema": {
  // Query SQLite for table names and column info
  // Return: { tables: [{ name: "post", columns: ["id","title","body","status"] }] }
  const tables = getSchemaInfo(adapter);
  return { status: 200, data: { tables } };
}
```

**editor/server.ts** — Load schema at boot for the system prompt.

**editor/public/js/chat-panel.js** — Include context in each message.

### Test Criteria
- AI responds with awareness of the current source content
- AI suggests data directives when it knows the schema
- AI references the selected component when one is selected
- Schema endpoint returns accurate table/column information

---

## Phase 5: Island Generation via Chat

**Goal:** When the user requests a Layer 5 capability, the AI generates both the island definition file and the template mount point. The builder triggers the bundle and the island appears in the canvas.

### Files to Create

**editor/public/js/island-generator.js** — Handles island creation from chat.

When the AI's response includes an island definition (detected by the presence of `defineIsland` in the response), the generator:
1. Extracts the island source code from the AI's response
2. POSTs it to `/api/builder/create-island` with the island name
3. The server writes the file to the islands directory
4. The server runs `Bun.build()` on the file
5. The server returns the bundle path
6. The chat inserts the `<htx:component src="/ui/island.htx">` mount point into the source
7. The preview refreshes and loads the new island bundle

### Files to Modify

**modules/builder.ts** — Add `create-island` sub-path.

```javascript
case "create-island": {
  const { name, source } = body;
  // Write source to islands/{name}.tsx
  // Run Bun.build() on it
  // Update islands manifest
  // Return: { success: true, bundle: "/js/islands/{name}.js", size: N }
}
```

**editor/server.ts** — Add `/api/builder/create-island` as async endpoint (Bun.build is async).

### AI Prompt Addition

When the user requests a capability the template authoring context identifies as Layer 5 (charts, rich text, maps, 3D, complex drag-and-drop), the AI is instructed to:

1. Generate the `defineIsland()` file in a ```tsx code block
2. Generate the template mount point in the modified .htx source
3. Explain what the island does and why it requires Layer 5

The system prompt includes:
```
If the user requests interactive charts, rich text editing, maps, 3D rendering,
or complex drag-and-drop, generate a defineIsland() file using the appropriate
npm package. Return the island source in a ```tsx block and the template mount
in the modified .htx source.
```

### Test Criteria
- "Add a chart of post counts" generates an island definition + mount point
- The server compiles the island and serves the bundle
- The canvas displays the island after preview refresh
- The island is listed in the islands manifest

---

## Phase 6: Bidirectional Awareness

**Goal:** The visual builder and chat observe each other's changes. Visual edits are summarized for the AI. Chat edits are attributed in the history.

### Files to Create

**editor/public/js/edit-history.js** — Tagged edit history.

```javascript
var history = signal([]);
// Each entry: { source: "visual"|"chat"|"manual", description: string, timestamp, diff }

function pushEdit(source, description, oldSource, newSource) {
  history.value = [...history.value, {
    source, description,
    timestamp: Date.now(),
    diff: diffLines(oldSource, newSource),
  }];
}
```

Undo/redo operates on this history regardless of edit source. Ctrl+Z undoes the last change whether it came from the visual builder, the chat, or manual source editing.

### Files to Modify

**editor/public/js/editor-app.js** — Emit edit events.

When the visual builder modifies the source (drag-and-drop, prop change, delete):
```javascript
pushEdit("visual", "Added Card component", oldSource, newSource);
window.dispatchEvent(new CustomEvent("editor:visual-edit", {
  detail: { description: "Added Card component", source: newSource }
}));
```

**editor/public/js/chat-panel.js** — Observe visual edits.

```javascript
window.addEventListener("editor:visual-edit", function(e) {
  // Add a system message to the chat:
  // "[Visual edit] Added Card component"
  // This gives the AI context about what the user just did
  // The next chat message includes this in recentEdits
});
```

When the AI modifies the source:
```javascript
pushEdit("chat", "AI: Added blog post list with htx:data + htx:each", oldSource, newSource);
```

### The Bidirectional Flow

```
User drags Card → pushEdit("visual") → chat sees "[Visual edit] Added Card"
User types "connect to posts" → AI modifies source → pushEdit("chat")
→ canvas updates → property panel updates → chat shows diff
User selects the card → types "change title to dynamic" → AI modifies
→ pushEdit("chat") → canvas updates → user sees the change visually
User visually moves the card → pushEdit("visual") → chat sees the move
```

Both interfaces observe the same source signal. Both contribute to the same edit history. The user's workflow flows naturally between spatial and conversational without switching contexts.

### Test Criteria
- Visual edits appear as system messages in the chat
- Chat edits appear in the edit history with "chat" attribution
- Ctrl+Z undoes the last change regardless of source
- The AI's next response includes awareness of recent visual edits

---

## Phase 7: Starter Prompts + Contextual Suggestions

**Goal:** Pre-built prompts for common patterns and contextual suggestions after each edit.

### Files to Create

**editor/public/js/starter-prompts.js** — Starter prompt data and suggestion logic.

Starter prompts (shown when the chat is first opened or the page is empty):
```javascript
var starters = [
  { label: "Blog", prompt: "Create a blog with a post list, detail pages, and a create form" },
  { label: "Dashboard", prompt: "Create a dashboard with stat cards and a recent activity list" },
  { label: "CRUD", prompt: "Create a CRUD interface for managing posts with list, create, edit, and delete" },
  { label: "Landing", prompt: "Create a landing page with a hero section, feature cards, and a CTA" },
  { label: "Auth", prompt: "Add login/logout with auth-gated content showing different views" },
  { label: "Search", prompt: "Add a search page with filtering and paginated results" },
];
```

Contextual suggestions (shown as chips after each AI response):
```javascript
function getSuggestions(currentSource, lastAction) {
  var suggestions = [];
  // If source has htx:data but no htx:each:
  if (hasDirective("htx:data") && !hasDirective("htx:each"))
    suggestions.push("Add iteration to display the data");
  // If source has a form but no htx:action:
  if (hasElement("form") && !hasDirective("htx:action"))
    suggestions.push("Add a mutation token for form submission");
  // If source has no htx:auth and schema has a user table:
  if (!hasDirective("htx:auth") && schemaHasTable("user"))
    suggestions.push("Add authentication gating");
  // If source has data but no components:
  if (hasDirective("htx:each") && !hasDirective("htx:component"))
    suggestions.push("Wrap items in Card components");
  // If source is complex enough for an island:
  if (lastAction === "chat" && mentionsChart(lastMessage))
    suggestions.push("Generate a Recharts island for visualization");
  return suggestions;
}
```

Suggestions appear as clickable chips below the AI's response. Clicking one sends it as the next message.

### Files to Modify

**editor/public/js/chat-panel.js** — Show starters on empty chat, show suggestions after responses.

### Test Criteria
- Empty chat shows starter prompt chips
- Clicking a starter sends it as a message
- After AI response, relevant suggestions appear as chips
- Clicking a suggestion sends it as the next message
- Suggestions are contextually relevant to the current source

---

## Phase 8: Polish + Production

**Goal:** Production-quality chat experience with streaming, persistence, error handling, and performance.

### Streaming Responses

**src/llm/claude.ts** — Use Anthropic's streaming API.

Instead of waiting for the complete response, stream tokens as they arrive:
1. POST to Anthropic with `stream: true`
2. Read SSE events from the response
3. Forward each text delta to the client via a streaming response
4. The chat panel appends tokens as they arrive (typewriter effect)
5. When the complete response arrives, parse for modified source and apply

**editor/server.ts** — `/api/chat` returns a streaming response.

**editor/public/js/chat-panel.js** — Read streaming response with `EventSource` or `fetch` with `ReadableStream`.

### Conversation History

**modules/builder.ts** — Add `chat-history` sub-paths.

```javascript
case "chat-history/save": {
  // Save conversation to a chat_history table: { page_id, messages_json }
}
case "chat-history/load": {
  // Load conversation for a page
}
```

On page load, the chat panel loads the previous conversation. The AI has continuity across sessions.

Database addition:
```sql
CREATE TABLE IF NOT EXISTS chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER REFERENCES page(id),
  messages TEXT, -- JSON array of messages
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Error Handling

- API key missing: show configuration message in chat
- API rate limited: show retry countdown
- API error: show error message with retry button
- Malformed AI output (no valid .htx): show the response without applying, let user retry
- Network failure: show offline indicator, queue message for retry

### Rate Limiting

- Client-side: disable send button for 2 seconds after each message
- Server-side: rate limit module already active (configured per-endpoint)

### Keyboard Shortcuts

- `Cmd+L` — focus chat input
- `Escape` — collapse chat panel (if focused)
- `Cmd+Enter` — send message (alternative to Enter)
- `Cmd+Z` — undo last change (works for both visual and chat edits)

### Mobile Responsive

- Chat panel becomes full-screen overlay on narrow viewports
- Swipe up to expand, swipe down to collapse
- Message input stays above the keyboard

### Files to Create/Modify

- Update `src/llm/claude.ts` — streaming support
- Update `editor/server.ts` — streaming `/api/chat` endpoint
- Update `editor/public/js/chat-panel.js` — streaming display, history load
- Update `modules/builder.ts` — chat history CRUD
- Update `editor/public/css/chat-panel.css` — mobile responsive, streaming animation

### Test Criteria
- Streaming: tokens appear as the AI generates them
- History: conversation persists across page reloads
- Errors: all failure modes show clear, actionable messages
- Rate limiting: rapid sends are throttled gracefully
- Mobile: chat is usable on phone-sized viewports
- Keyboard: all shortcuts work

---

## LLM Context Structure

The seed (2,020 words) is for building ENGINES. The AI generating templates
doesn't need to understand the pipeline or how HMAC tokens are signed.
It needs the directives, the components, and the schema.

A focused template authoring context lives at src/llm/template-context.md.

**Bundled once at server boot (static system prompt):**
- Template authoring context (~800 words) — 16 directives, patterns, rules
- Available components — names and props from the registry
- Database schema — table names and columns from the adapter

**Per-request (dynamic user message):**
- Current .htx source
- Recent visual edits (if any)
- Selected component (if any)
- User's natural language message

```
System: [Template context + components + schema] (~2,000-3,000 tokens)
User: [Current source + context + message] (~500-2,000 tokens)
```

Total per-request: ~3,000-5,000 tokens. A fraction of React generation tools.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Editor Page (.htx template)                         │
├──────────┬───────────────────────┬──────────────────┤
│ Palette  │ Canvas (iframe)      │ Properties Panel  │
│          │ Preview of resolved  │                   │
│          │ .htx source          │                   │
├──────────┴───────────────────────┴──────────────────┤
│ Chat Panel (expandable)                              │
│ [starter chips] or [conversation + suggestion chips] │
│ [message input]                              [send] │
└─────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
    source signal ◄──── both read/write ────► source signal
         │                    │
         ▼                    ▼
    /api/preview         /api/chat
    (22-stage pipeline)  (LLM + context)
         │                    │
         ▼                    ▼
    iframe updates       source.value updates
                         → preview loop fires
                         → canvas updates
                         → diff shown in chat
```

Both interfaces read/write the same `source` signal. Changes from either
trigger the preview loop. The source is the single representation.

---

## Dependencies

- Anthropic API key (or any LLM API: OpenAI, local model via Ollama)
- Everything else already exists in presto-ts
- No new npm packages (fetch handles the API call)

---

## The Deliverable

A unified builder where the user can:
1. Drag components from the palette onto the canvas
2. Type "add a blog post list with search" in the chat
3. See both changes in the same preview instantly
4. Click a component to edit its props visually
5. Type "connect this to the posts table" in the chat
6. See the diff of what the AI changed
7. Undo any change regardless of whether it came from visual or chat
8. Request an island ("add a chart") and have it generated + built + mounted
9. Export the .htx file and serve it on any conformant engine

Two paradigms. One representation. One preview. One save. One undo stack.
