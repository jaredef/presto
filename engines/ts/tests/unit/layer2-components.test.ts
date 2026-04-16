// Layer 2 component tests — verify resolution + script extraction

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrestoEngine } from "../../src/engine";
import { SqliteAdapter } from "../../src/adapters/sqlite";
import { join } from "node:path";
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import type { HtxRequest } from "../../src/types";

const TEMPLATES = join(import.meta.dir, "../../templates");
const PUBLIC = join(import.meta.dir, "../../public");
const DB_PATH = join(import.meta.dir, "layer2-test.sqlite");
const SECRET = "layer2-test-secret";
const TEST_DIR = join(TEMPLATES, "test-l2");

let adapter: SqliteAdapter;
let engine: PrestoEngine;

function req(path: string): HtxRequest {
  return { method: "GET", path, query: {}, headers: {}, cookies: {}, body: {}, bodyRaw: "", contentType: "", hxRequest: false, auth: null };
}

beforeAll(() => {
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  adapter = new SqliteAdapter(DB_PATH);
  adapter.exec("CREATE TABLE IF NOT EXISTS post (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, title TEXT, body TEXT, status TEXT)");
  adapter.exec("INSERT INTO post (slug, title, body, status) VALUES ('a', 'Alpha', 'Body A', 'published')");
  adapter.exec("INSERT INTO post (slug, title, body, status) VALUES ('b', 'Beta', 'Body B', 'published')");
  engine = new PrestoEngine({ templateDir: TEMPLATES, publicDir: PUBLIC, secret: SECRET, adapter });

  mkdirSync(TEST_DIR, { recursive: true });

  writeFileSync(join(TEST_DIR, "dialog.htx"), `<htx:layout none />
<htx:component src="/ui/dialog.htx" trigger="Open Dialog" title="My Dialog" description="A test dialog"><p>Dialog content here</p></htx:component>`);

  writeFileSync(join(TEST_DIR, "tabs.htx"), `<htx:layout none />
<htx:component src="/ui/tabs.htx" active="0">
<button role="tab">Tab 1</button><button role="tab">Tab 2</button>
<div role="tabpanel">Panel 1</div><div role="tabpanel">Panel 2</div>
</htx:component>`);

  writeFileSync(join(TEST_DIR, "dropdown.htx"), `<htx:layout none />
<htx:component src="/ui/dropdown.htx" trigger="Actions">
<a class="ui-dropdown-item" href="#">Edit</a>
<a class="ui-dropdown-item" href="#">Delete</a>
</htx:component>`);

  writeFileSync(join(TEST_DIR, "tooltip.htx"), `<htx:layout none />
<htx:component src="/ui/tooltip.htx" text="Helpful info" position="top"><button>Hover me</button></htx:component>`);

  writeFileSync(join(TEST_DIR, "switch.htx"), `<htx:layout none />
<htx:component src="/ui/switch.htx" label="Dark Mode" name="theme" />`);

  writeFileSync(join(TEST_DIR, "slider.htx"), `<htx:layout none />
<htx:component src="/ui/slider.htx" label="Volume" name="vol" min="0" max="100" value="75" />`);

  writeFileSync(join(TEST_DIR, "accordion.htx"), `<htx:layout none />
<htx:component src="/ui/accordion.htx">
<div class="ui-accordion-item"><button class="ui-accordion-trigger">Section 1</button><div class="ui-accordion-content">Content 1</div></div>
<div class="ui-accordion-item"><button class="ui-accordion-trigger">Section 2</button><div class="ui-accordion-content">Content 2</div></div>
</htx:component>`);

  writeFileSync(join(TEST_DIR, "data-table.htx"), `<htx:layout none />
<htx:component src="/ui/data-table.htx" type="post" columns="title,status">
<td><htx:v>row.title</htx:v></td><td><htx:v>row.status</htx:v></td>
</htx:component>`);

  writeFileSync(join(TEST_DIR, "copy-button.htx"), `<htx:layout none />
<htx:component src="/ui/copy-button.htx" text="npm install presto" label="Copy" />`);

  writeFileSync(join(TEST_DIR, "popover.htx"), `<htx:layout none />
<htx:component src="/ui/popover.htx" trigger="Info"><p>Popover content</p></htx:component>`);

  writeFileSync(join(TEST_DIR, "command.htx"), `<htx:layout none />
<htx:component src="/ui/command-palette.htx" placeholder="Search commands..." hotkey="k">
<div class="ui-command-item">Save</div><div class="ui-command-item">Open</div>
</htx:component>`);
});

afterAll(() => {
  adapter.close();
  for (const f of [DB_PATH, DB_PATH + "-wal", DB_PATH + "-shm"]) {
    if (existsSync(f)) unlinkSync(f);
  }
  if (existsSync(TEST_DIR)) require("node:fs").rmSync(TEST_DIR, { recursive: true });
});

describe("Layer 2 Components — Pipeline Resolution + Script Extraction", () => {

  test("Dialog: renders trigger, title, slot, and extracts script", async () => {
    const resp = await engine.handle(req("/test-l2/dialog"));
    expect(resp.body).toContain("Open Dialog");
    expect(resp.body).toContain("My Dialog");
    expect(resp.body).toContain("Dialog content here");
    expect(resp.body).toContain("<script>"); // Script was extracted and injected
    expect(resp.body).toContain("Escape"); // ESC key handler
  });

  test("Tabs: renders with ARIA roles and extracts script", async () => {
    const resp = await engine.handle(req("/test-l2/tabs"));
    expect(resp.body).toContain('role="tablist"');
    expect(resp.body).toContain('role="tab"');
    expect(resp.body).toContain('role="tabpanel"');
    expect(resp.body).toContain("Panel 1");
    expect(resp.body).toContain("<script>");
    expect(resp.body).toContain("ArrowRight"); // keyboard nav
  });

  test("Dropdown: renders trigger and menu with script", async () => {
    const resp = await engine.handle(req("/test-l2/dropdown"));
    expect(resp.body).toContain("Actions");
    expect(resp.body).toContain("ui-dropdown-item");
    expect(resp.body).toContain("Edit");
    expect(resp.body).toContain("<script>");
  });

  test("Tooltip: renders with position and hover script", async () => {
    const resp = await engine.handle(req("/test-l2/tooltip"));
    expect(resp.body).toContain("ui-tooltip-top");
    expect(resp.body).toContain("Helpful info");
    expect(resp.body).toContain("Hover me");
    expect(resp.body).toContain("<script>");
    expect(resp.body).toContain("mouseenter");
  });

  test("Switch: renders toggle with label and script", async () => {
    const resp = await engine.handle(req("/test-l2/switch"));
    expect(resp.body).toContain("ui-switch");
    expect(resp.body).toContain("Dark Mode");
    expect(resp.body).toContain('name="theme"');
    expect(resp.body).toContain("<script>");
  });

  test("Slider: renders range input with value display and script", async () => {
    const resp = await engine.handle(req("/test-l2/slider"));
    expect(resp.body).toContain("ui-slider");
    expect(resp.body).toContain("Volume");
    expect(resp.body).toContain('value="75"');
    expect(resp.body).toContain("<script>");
  });

  test("Accordion: renders collapsible sections with script", async () => {
    const resp = await engine.handle(req("/test-l2/accordion"));
    expect(resp.body).toContain("ui-accordion");
    expect(resp.body).toContain("Section 1");
    expect(resp.body).toContain("Content 2");
    expect(resp.body).toContain("<script>");
  });

  test("DataTable: queries adapter and renders with script for headers", async () => {
    const resp = await engine.handle(req("/test-l2/data-table"));
    expect(resp.body).toContain("ui-data-table");
    expect(resp.body).toContain("Alpha");
    expect(resp.body).toContain("Beta");
    expect(resp.body).toContain("<script>");
    expect(resp.body).toContain("data-columns");
  });

  test("CopyButton: renders with clipboard script", async () => {
    const resp = await engine.handle(req("/test-l2/copy-button"));
    expect(resp.body).toContain("ui-copy-btn");
    expect(resp.body).toContain("Copy");
    expect(resp.body).toContain("<script>");
    expect(resp.body).toContain("clipboard");
  });

  test("Popover: renders with toggle script", async () => {
    const resp = await engine.handle(req("/test-l2/popover"));
    expect(resp.body).toContain("ui-popover");
    expect(resp.body).toContain("Popover content");
    expect(resp.body).toContain("<script>");
  });

  test("CommandPalette: renders with hotkey script", async () => {
    const resp = await engine.handle(req("/test-l2/command"));
    expect(resp.body).toContain("ui-command-palette");
    expect(resp.body).toContain("Search commands...");
    expect(resp.body).toContain("<script>");
    expect(resp.body).toContain("metaKey");
  });

  test("No htx: directives remain in any Layer 2 output", async () => {
    const paths = ["/test-l2/dialog", "/test-l2/tabs", "/test-l2/dropdown", "/test-l2/switch"];
    for (const p of paths) {
      const resp = await engine.handle(req(p));
      expect(resp.body).not.toMatch(/<htx:(props|slot|component|script)\b/);
    }
  });
});
