// Layer 0 component tests — verify resolution through the 22-stage pipeline

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrestoEngine } from "../../src/engine";
import { SqliteAdapter } from "../../src/adapters/sqlite";
import { join } from "node:path";
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import type { HtxRequest } from "../../src/types";

const TEMPLATES = join(import.meta.dir, "../../templates");
const PUBLIC = join(import.meta.dir, "../../public");
const DB_PATH = join(import.meta.dir, "components-test.sqlite");
const SECRET = "component-test-secret";
const TEST_DIR = join(TEMPLATES, "test-ui");

let adapter: SqliteAdapter;
let engine: PrestoEngine;

function req(path: string): HtxRequest {
  return { method: "GET", path, query: {}, headers: {}, cookies: {}, body: {}, bodyRaw: "", contentType: "", hxRequest: false, auth: null };
}

beforeAll(() => {
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  adapter = new SqliteAdapter(DB_PATH);
  engine = new PrestoEngine({ templateDir: TEMPLATES, publicDir: PUBLIC, secret: SECRET, adapter });

  mkdirSync(TEST_DIR, { recursive: true });

  // Test pages that use components
  writeFileSync(join(TEST_DIR, "button.htx"), `<htx:layout none />
<htx:component src="/ui/button.htx" variant="primary"><span>Click Me</span></htx:component>
<htx:component src="/ui/button.htx" variant="destructive" size="lg">Delete</htx:component>`);

  writeFileSync(join(TEST_DIR, "input.htx"), `<htx:layout none />
<htx:component src="/ui/input.htx" label="Email" type="email" name="email" placeholder="you@example.com" />`);

  writeFileSync(join(TEST_DIR, "card.htx"), `<htx:layout none />
<htx:component src="/ui/card.htx" title="My Card" description="A description"><p>Card body content</p></htx:component>`);

  writeFileSync(join(TEST_DIR, "badge.htx"), `<htx:layout none />
<htx:component src="/ui/badge.htx" variant="secondary">Published</htx:component>
<htx:component src="/ui/badge.htx" variant="destructive">Deleted</htx:component>`);

  writeFileSync(join(TEST_DIR, "alert.htx"), `<htx:layout none />
<htx:component src="/ui/alert.htx" variant="warning" title="Warning">Something happened</htx:component>`);

  writeFileSync(join(TEST_DIR, "avatar.htx"), `<htx:layout none />
<htx:component src="/ui/avatar.htx" src="/img/user.jpg" alt="User" initials="JF" size="lg" />`);

  writeFileSync(join(TEST_DIR, "skeleton.htx"), `<htx:layout none />
<htx:component src="/ui/skeleton.htx" width="200px" height="1.5rem" />`);

  writeFileSync(join(TEST_DIR, "nav.htx"), `<htx:layout none />
<htx:component src="/ui/nav.htx" orientation="vertical"><a href="/">Home</a><a href="/about">About</a></htx:component>`);

  writeFileSync(join(TEST_DIR, "sidebar.htx"), `<htx:layout none />
<htx:component src="/ui/sidebar.htx" width="280px"><p>Sidebar content</p></htx:component>`);

  writeFileSync(join(TEST_DIR, "separator.htx"), `<htx:layout none />
<p>Above</p>
<htx:component src="/ui/separator.htx" />
<p>Below</p>`);

  writeFileSync(join(TEST_DIR, "checkbox.htx"), `<htx:layout none />
<htx:component src="/ui/checkbox.htx" label="Accept terms" name="terms" value="yes" />`);

  writeFileSync(join(TEST_DIR, "table.htx"), `<htx:layout none />
<htx:component src="/ui/table.htx"><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Alice</td></tr></tbody></htx:component>`);

  writeFileSync(join(TEST_DIR, "breadcrumb.htx"), `<htx:layout none />
<htx:component src="/ui/breadcrumb.htx"><li><a href="/">Home</a></li><li>Current</li></htx:component>`);
});

afterAll(() => {
  adapter.close();
  for (const f of [DB_PATH, DB_PATH + "-wal", DB_PATH + "-shm"]) {
    if (existsSync(f)) unlinkSync(f);
  }
  // Clean up test templates
  const { readdirSync, rmSync } = require("node:fs");
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe("Layer 0 Components — Pipeline Resolution", () => {

  test("Button: renders with variant, size, and slot content", async () => {
    const resp = await engine.handle(req("/test-ui/button"));
    expect(resp.status).toBe(200);
    expect(resp.body).toContain("ui-btn-primary");
    expect(resp.body).toContain("Click Me");
    expect(resp.body).toContain("ui-btn-destructive");
    expect(resp.body).toContain("ui-btn-lg");
    expect(resp.body).toContain("Delete");
  });

  test("Input: renders with label, type, name, placeholder", async () => {
    const resp = await engine.handle(req("/test-ui/input"));
    expect(resp.body).toContain("ui-field");
    expect(resp.body).toContain("ui-label");
    expect(resp.body).toContain('type="email"');
    expect(resp.body).toContain('name="email"');
    expect(resp.body).toContain('placeholder="you@example.com"');
    expect(resp.body).toContain("Email");
  });

  test("Card: renders with title, description, and slot body", async () => {
    const resp = await engine.handle(req("/test-ui/card"));
    expect(resp.body).toContain("ui-card");
    expect(resp.body).toContain("My Card");
    expect(resp.body).toContain("A description");
    expect(resp.body).toContain("Card body content");
  });

  test("Badge: renders with variant and slot text", async () => {
    const resp = await engine.handle(req("/test-ui/badge"));
    expect(resp.body).toContain("ui-badge-secondary");
    expect(resp.body).toContain("Published");
    expect(resp.body).toContain("ui-badge-destructive");
    expect(resp.body).toContain("Deleted");
  });

  test("Alert: renders with variant, title, and slot body", async () => {
    const resp = await engine.handle(req("/test-ui/alert"));
    expect(resp.body).toContain("ui-alert-warning");
    expect(resp.body).toContain("Warning");
    expect(resp.body).toContain("Something happened");
  });

  test("Avatar: renders with src, alt, initials, size", async () => {
    const resp = await engine.handle(req("/test-ui/avatar"));
    expect(resp.body).toContain("ui-avatar-lg");
    expect(resp.body).toContain('src="/img/user.jpg"');
    expect(resp.body).toContain("JF");
  });

  test("Skeleton: renders with width and height", async () => {
    const resp = await engine.handle(req("/test-ui/skeleton"));
    expect(resp.body).toContain("ui-skeleton");
    expect(resp.body).toContain("width:200px");
    expect(resp.body).toContain("height:1.5rem");
  });

  test("Nav: renders with orientation and slot links", async () => {
    const resp = await engine.handle(req("/test-ui/nav"));
    expect(resp.body).toContain("ui-nav-vertical");
    expect(resp.body).toContain("Home");
    expect(resp.body).toContain("About");
  });

  test("Sidebar: renders with width and slot content", async () => {
    const resp = await engine.handle(req("/test-ui/sidebar"));
    expect(resp.body).toContain("ui-sidebar");
    expect(resp.body).toContain("width:280px");
    expect(resp.body).toContain("Sidebar content");
  });

  test("Separator: renders horizontal rule", async () => {
    const resp = await engine.handle(req("/test-ui/separator"));
    expect(resp.body).toContain("ui-separator");
  });

  test("Checkbox: renders with label and name", async () => {
    const resp = await engine.handle(req("/test-ui/checkbox"));
    expect(resp.body).toContain("ui-checkbox");
    expect(resp.body).toContain("Accept terms");
    expect(resp.body).toContain('name="terms"');
  });

  test("Table: renders with slot content", async () => {
    const resp = await engine.handle(req("/test-ui/table"));
    expect(resp.body).toContain("ui-table");
    expect(resp.body).toContain("Alice");
  });

  test("Breadcrumb: renders with slot items", async () => {
    const resp = await engine.handle(req("/test-ui/breadcrumb"));
    expect(resp.body).toContain("ui-breadcrumb");
    expect(resp.body).toContain("Home");
    expect(resp.body).toContain("Current");
  });

  test("No htx: directives remain in output", async () => {
    const resp = await engine.handle(req("/test-ui/card"));
    // All htx: should be consumed by the pipeline
    expect(resp.body).not.toMatch(/<htx:(props|slot|component)/);
  });
});
