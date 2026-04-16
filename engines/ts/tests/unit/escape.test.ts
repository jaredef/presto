// Phase 8: Progressive escape verification
// For key components, verify the raw directive equivalent produces equivalent output

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrestoEngine } from "../../src/engine";
import { SqliteAdapter } from "../../src/adapters/sqlite";
import { join } from "node:path";
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import type { HtxRequest } from "../../src/types";

const TEMPLATES = join(import.meta.dir, "../../templates");
const PUBLIC = join(import.meta.dir, "../../public");
const DB_PATH = join(import.meta.dir, "escape-test.sqlite");
const SECRET = "escape-test-secret";
const TEST_DIR = join(TEMPLATES, "test-escape");

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

  // Card: library version
  writeFileSync(join(TEST_DIR, "card-lib.htx"), `<htx:layout none />
<htx:component src="/ui/card.htx" title="Test" description="Desc"><p>Body</p></htx:component>`);

  // Card: escaped version (raw directives)
  writeFileSync(join(TEST_DIR, "card-raw.htx"), `<htx:layout none />
<div class="ui-card">
  <div class="ui-card-header">
    <h3 class="ui-card-title">Test</h3>
    <p class="ui-card-description">Desc</p>
  </div>
  <div class="ui-card-content">
    <p>Body</p>
  </div>
</div>`);

  // Badge: library
  writeFileSync(join(TEST_DIR, "badge-lib.htx"), `<htx:layout none />
<htx:component src="/ui/badge.htx" variant="secondary">Active</htx:component>`);

  // Badge: escaped
  writeFileSync(join(TEST_DIR, "badge-raw.htx"), `<htx:layout none />
<span class="ui-badge ui-badge-secondary">Active</span>`);

  // Data list: library (DataTable)
  writeFileSync(join(TEST_DIR, "list-lib.htx"), `<htx:layout none />
<htx:component src="/ui/data-table.htx" type="post" columns="title,status">
<td><htx:v>row.title</htx:v></td><td><htx:v>row.status</htx:v></td>
</htx:component>`);

  // Data list: escaped (raw directives)
  writeFileSync(join(TEST_DIR, "list-raw.htx"), `<htx:layout none />
<htx:data type="post" order="id desc" limit="10" as="posts" />
<table class="ui-table">
  <thead><tr><th>Title</th><th>Status</th></tr></thead>
  <tbody>
    <htx:each items="posts" as="post">
    <tr><td><htx:v>post.title</htx:v></td><td><htx:v>post.status</htx:v></td></tr>
    </htx:each>
  </tbody>
</table>`);

  // Alert: library
  writeFileSync(join(TEST_DIR, "alert-lib.htx"), `<htx:layout none />
<htx:component src="/ui/alert.htx" variant="warning" title="Watch Out">Be careful</htx:component>`);

  // Alert: escaped
  writeFileSync(join(TEST_DIR, "alert-raw.htx"), `<htx:layout none />
<div class="ui-alert ui-alert-warning" role="alert">
  <div class="ui-alert-title">Watch Out</div>
  <div class="ui-alert-body">Be careful</div>
</div>`);
});

afterAll(() => {
  adapter.close();
  for (const f of [DB_PATH, DB_PATH + "-wal", DB_PATH + "-shm"]) {
    if (existsSync(f)) unlinkSync(f);
  }
  if (existsSync(TEST_DIR)) require("node:fs").rmSync(TEST_DIR, { recursive: true });
});

describe("Progressive Escape Verification", () => {

  test("Card: library and raw produce equivalent content", async () => {
    const lib = await engine.handle(req("/test-escape/card-lib"));
    const raw = await engine.handle(req("/test-escape/card-raw"));
    // Both should contain the same structural elements
    expect(lib.body).toContain("ui-card");
    expect(raw.body).toContain("ui-card");
    expect(lib.body).toContain("Test");
    expect(raw.body).toContain("Test");
    expect(lib.body).toContain("Desc");
    expect(raw.body).toContain("Desc");
    expect(lib.body).toContain("Body");
    expect(raw.body).toContain("Body");
  });

  test("Badge: library and raw produce equivalent content", async () => {
    const lib = await engine.handle(req("/test-escape/badge-lib"));
    const raw = await engine.handle(req("/test-escape/badge-raw"));
    expect(lib.body).toContain("ui-badge-secondary");
    expect(raw.body).toContain("ui-badge-secondary");
    expect(lib.body).toContain("Active");
    expect(raw.body).toContain("Active");
  });

  test("Data list: library and raw both render data from adapter", async () => {
    const lib = await engine.handle(req("/test-escape/list-lib"));
    const raw = await engine.handle(req("/test-escape/list-raw"));
    // Both should have the post data
    expect(lib.body).toContain("Alpha");
    expect(raw.body).toContain("Alpha");
    expect(lib.body).toContain("Beta");
    expect(raw.body).toContain("Beta");
    // Both use the same CSS classes
    expect(lib.body).toContain("ui-table");
    expect(raw.body).toContain("ui-table");
  });

  test("Alert: library and raw produce equivalent content", async () => {
    const lib = await engine.handle(req("/test-escape/alert-lib"));
    const raw = await engine.handle(req("/test-escape/alert-raw"));
    expect(lib.body).toContain("ui-alert-warning");
    expect(raw.body).toContain("ui-alert-warning");
    expect(lib.body).toContain("Watch Out");
    expect(raw.body).toContain("Watch Out");
    expect(lib.body).toContain("Be careful");
    expect(raw.body).toContain("Be careful");
    expect(lib.body).toContain('role="alert"');
    expect(raw.body).toContain('role="alert"');
  });

  test("No htx: remains in any library output", async () => {
    for (const p of ["card-lib", "badge-lib", "list-lib", "alert-lib"]) {
      const resp = await engine.handle(req(`/test-escape/${p}`));
      expect(resp.body).not.toMatch(/<htx:(props|slot|component|data|each)\b/);
    }
  });

  test("No htx: remains in any raw output", async () => {
    for (const p of ["card-raw", "badge-raw", "list-raw", "alert-raw"]) {
      const resp = await engine.handle(req(`/test-escape/${p}`));
      expect(resp.body).not.toMatch(/<htx:(data|each|v)\b/);
    }
  });
});
