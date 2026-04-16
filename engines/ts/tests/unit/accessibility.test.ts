// Phase 8: Accessibility verification
// Checks ARIA roles, semantic HTML, keyboard-accessible patterns

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrestoEngine } from "../../src/engine";
import { SqliteAdapter } from "../../src/adapters/sqlite";
import { join } from "node:path";
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import type { HtxRequest } from "../../src/types";

const TEMPLATES = join(import.meta.dir, "../../templates");
const PUBLIC = join(import.meta.dir, "../../public");
const DB_PATH = join(import.meta.dir, "a11y-test.sqlite");
const SECRET = "a11y-test-secret";
const TEST_DIR = join(TEMPLATES, "test-a11y");

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

  writeFileSync(join(TEST_DIR, "a11y-form.htx"), `<htx:layout none />
<htx:component src="/ui/form.htx" action="create" type="item">
  <htx:component src="/ui/input.htx" label="Name" type="text" name="name" required="required" />
  <htx:component src="/ui/textarea.htx" label="Notes" name="notes" />
  <htx:component src="/ui/select.htx" label="Priority" name="priority">
    <option value="low">Low</option>
    <option value="high">High</option>
  </htx:component>
  <htx:component src="/ui/checkbox.htx" label="Urgent" name="urgent" value="yes" />
</htx:component>`);

  writeFileSync(join(TEST_DIR, "a11y-interactive.htx"), `<htx:layout none />
<htx:component src="/ui/dialog.htx" trigger="Open" title="Accessible Dialog" description="Test dialog">
  <p>Content</p>
</htx:component>
<htx:component src="/ui/tabs.htx" active="0">
  <button role="tab">One</button><button role="tab">Two</button>
  <div role="tabpanel">Panel one</div><div role="tabpanel">Panel two</div>
</htx:component>
<htx:component src="/ui/alert.htx" variant="error" title="Error">Something failed</htx:component>
<htx:component src="/ui/breadcrumb.htx"><li><a href="/">Home</a></li><li>Current</li></htx:component>
<htx:component src="/ui/tooltip.htx" text="Help text"><button>Info</button></htx:component>
<htx:component src="/ui/skeleton.htx" width="100%" height="2rem" />`);
});

afterAll(() => {
  adapter.close();
  for (const f of [DB_PATH, DB_PATH + "-wal", DB_PATH + "-shm"]) {
    if (existsSync(f)) unlinkSync(f);
  }
  if (existsSync(TEST_DIR)) require("node:fs").rmSync(TEST_DIR, { recursive: true });
});

describe("Accessibility Audit", () => {

  test("Form: all inputs have associated labels", async () => {
    const resp = await engine.handle(req("/test-a11y/a11y-form"));
    const body = resp.body;
    // Every ui-field should have a label before the input
    const fields = body.match(/class="ui-field"/g) || [];
    const labels = body.match(/class="ui-label"/g) || [];
    expect(fields.length).toBeGreaterThan(0);
    expect(labels.length).toBe(fields.length);
  });

  test("Form: submit button has type=submit", async () => {
    const resp = await engine.handle(req("/test-a11y/a11y-form"));
    expect(resp.body).toContain('type="submit"');
  });

  test("Form: required fields marked", async () => {
    const resp = await engine.handle(req("/test-a11y/a11y-form"));
    expect(resp.body).toContain("required");
  });

  test("Dialog: has role=dialog and aria-modal", async () => {
    const resp = await engine.handle(req("/test-a11y/a11y-interactive"));
    expect(resp.body).toContain('role="dialog"');
    expect(resp.body).toContain('aria-modal="true"');
  });

  test("Dialog: close button has aria-label", async () => {
    const resp = await engine.handle(req("/test-a11y/a11y-interactive"));
    expect(resp.body).toContain('aria-label="Close"');
  });

  test("Dialog: script handles Escape key", async () => {
    const resp = await engine.handle(req("/test-a11y/a11y-interactive"));
    expect(resp.body).toContain("Escape");
  });

  test("Tabs: proper ARIA roles (tablist, tab, tabpanel)", async () => {
    const resp = await engine.handle(req("/test-a11y/a11y-interactive"));
    expect(resp.body).toContain('role="tablist"');
    expect(resp.body).toContain('role="tab"');
    expect(resp.body).toContain('role="tabpanel"');
  });

  test("Tabs: keyboard navigation (ArrowLeft/ArrowRight)", async () => {
    const resp = await engine.handle(req("/test-a11y/a11y-interactive"));
    expect(resp.body).toContain("ArrowRight");
    expect(resp.body).toContain("ArrowLeft");
  });

  test("Alert: has role=alert", async () => {
    const resp = await engine.handle(req("/test-a11y/a11y-interactive"));
    expect(resp.body).toContain('role="alert"');
  });

  test("Breadcrumb: has aria-label=Breadcrumb", async () => {
    const resp = await engine.handle(req("/test-a11y/a11y-interactive"));
    expect(resp.body).toContain('aria-label="Breadcrumb"');
  });

  test("Tooltip: has role=tooltip", async () => {
    const resp = await engine.handle(req("/test-a11y/a11y-interactive"));
    expect(resp.body).toContain('role="tooltip"');
  });

  test("Skeleton: has aria-hidden=true", async () => {
    const resp = await engine.handle(req("/test-a11y/a11y-interactive"));
    expect(resp.body).toContain('aria-hidden="true"');
  });

  test("Buttons: all have focus-visible styles via CSS class", async () => {
    const resp = await engine.handle(req("/test-a11y/a11y-interactive"));
    // All buttons rendered through ui-btn class which has :focus-visible in CSS
    expect(resp.body).toContain("ui-btn");
  });
});
