// Form + Action integration test

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrestoEngine } from "../../src/engine";
import { SqliteAdapter } from "../../src/adapters/sqlite";
import { ActionTokenService } from "../../src/security/tokens";
import { join } from "node:path";
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import type { HtxRequest } from "../../src/types";

const TEMPLATES = join(import.meta.dir, "../../templates");
const PUBLIC = join(import.meta.dir, "../../public");
const DB_PATH = join(import.meta.dir, "form-test.sqlite");
const SECRET = "form-test-secret";
const TEST_DIR = join(TEMPLATES, "test-form");

let adapter: SqliteAdapter;
let engine: PrestoEngine;

function req(overrides: Partial<HtxRequest> = {}): HtxRequest {
  return { method: "GET", path: "/test-form/create-post", query: {}, headers: {}, cookies: {}, body: {}, bodyRaw: "", contentType: "", hxRequest: false, auth: null, ...overrides };
}

beforeAll(() => {
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  adapter = new SqliteAdapter(DB_PATH);
  adapter.exec("CREATE TABLE IF NOT EXISTS post (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, title TEXT, body TEXT, status TEXT)");
  engine = new PrestoEngine({ templateDir: TEMPLATES, publicDir: PUBLIC, secret: SECRET, adapter });

  mkdirSync(TEST_DIR, { recursive: true });

  writeFileSync(join(TEST_DIR, "create-post.htx"), `<htx:layout none />
<htx:component src="/ui/form.htx" action="create" type="post">
  <htx:component src="/ui/input.htx" label="Title" name="title" required="required" />
  <htx:component src="/ui/textarea.htx" label="Body" name="body" rows="6" />
</htx:component>`);

  writeFileSync(join(TEST_DIR, "edit-post.htx"), `<htx:layout none />
<htx:component src="/ui/form.htx" action="update" type="post" record="42">
  <htx:component src="/ui/input.htx" label="Title" name="title" />
</htx:component>`);
});

afterAll(() => {
  adapter.close();
  for (const f of [DB_PATH, DB_PATH + "-wal", DB_PATH + "-shm"]) {
    if (existsSync(f)) unlinkSync(f);
  }
  if (existsSync(TEST_DIR)) require("node:fs").rmSync(TEST_DIR, { recursive: true });
});

describe("Form Component + htx:action Integration", () => {

  test("Form renders with signed action token in hidden field", async () => {
    const resp = await engine.handle(req());
    expect(resp.status).toBe(200);
    expect(resp.body).toContain("ui-form");
    expect(resp.body).toContain('name="_action_token"');
    // Token should be base64url format
    expect(resp.body).toMatch(/value="eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"/);
  });

  test("Form contains composed input components", async () => {
    const resp = await engine.handle(req());
    expect(resp.body).toContain("ui-field");
    expect(resp.body).toContain("Title");
    expect(resp.body).toContain("Body");
    expect(resp.body).toContain('name="title"');
    expect(resp.body).toContain('name="body"');
  });

  test("Form submit button present", async () => {
    const resp = await engine.handle(req());
    expect(resp.body).toContain('type="submit"');
    expect(resp.body).toContain("Submit");
  });

  test("Edit form includes record ID in action token", async () => {
    const resp = await engine.handle(req({ path: "/test-form/edit-post" }));
    expect(resp.body).toContain('name="_action_token"');
    // Extract token and verify it contains the record ID
    const tokenMatch = resp.body.match(/value="(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)"/);
    expect(tokenMatch).not.toBeNull();
    const service = new ActionTokenService(SECRET);
    const verified = await service.verify(tokenMatch![1]);
    expect(verified).not.toBeNull();
    expect(verified!.action).toBe("update");
    expect(verified!.type).toBe("post");
    expect(verified!.recordId).toBe("42");
  });

  test("POST with valid token creates record", async () => {
    // First, get the form to extract the token
    const getResp = await engine.handle(req());
    const tokenMatch = getResp.body.match(/value="(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)"/);
    expect(tokenMatch).not.toBeNull();

    // Submit the form
    const postResp = await engine.handle(req({
      method: "POST",
      path: "/test-form/create-post",
      body: {
        _action_token: tokenMatch![1],
        title: "New Post",
        body: "Post content",
        status: "published",
      },
      contentType: "application/json",
    }));

    expect(postResp.status).toBe(201);
    const data = JSON.parse(postResp.body);
    expect(data.success).toBe(true);
    expect(data.record.title).toBe("New Post");
  });

  test("POST with tampered token is rejected", async () => {
    const postResp = await engine.handle(req({
      method: "POST",
      path: "/test-form/create-post",
      body: {
        _action_token: "tampered.token",
        title: "Hack",
      },
      contentType: "application/json",
    }));
    expect(postResp.status).toBe(403);
  });

  test("No htx: directives remain in form output", async () => {
    const resp = await engine.handle(req());
    expect(resp.body).not.toMatch(/<htx:(props|slot|component|action)/);
  });
});
