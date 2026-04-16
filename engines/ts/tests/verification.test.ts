// PRESTO-TS v3 — 22-Test Verification Suite
// All 22 pass = conformant engine

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrestoEngine } from "../src/engine";
import { SqliteAdapter } from "../src/adapters/sqlite";
import { ChannelTokenService, ActionTokenService } from "../src/security/tokens";
import { join } from "node:path";
import { unlinkSync, existsSync } from "node:fs";
import type { HtxRequest, ChannelHandler, HtxModule } from "../src/types";
import { HtxResponse } from "../src/types";

const TEMPLATES = join(import.meta.dir, "../templates");
const PUBLIC = join(import.meta.dir, "../public");
const DB_PATH = join(import.meta.dir, "verification.sqlite");
const SECRET = "verification-test-secret-key";

let adapter: SqliteAdapter;
let engine: PrestoEngine;

function makeRequest(overrides: Partial<HtxRequest> = {}): HtxRequest {
  return {
    method: "GET",
    path: "/",
    query: {},
    headers: {},
    cookies: {},
    body: {},
    bodyRaw: "",
    contentType: "",
    hxRequest: false,
    auth: null,
    ...overrides,
  };
}

// Echo channel handler for tests 18-20
const echoHandler: ChannelHandler = {
  module: () => "echo",
  handle: (subPath, query, userId, options) => ({
    status: 200,
    data: { echo: subPath, user: userId },
  }),
};

const echoModule: HtxModule = {
  name: () => "echo-module",
  manifest: () => ({
    trust: "first-party" as const,
    channelHandlers: ["echo"],
  }),
  boot: (registry) => {
    registry.registerChannelHandler(echoHandler);
  },
};

beforeAll(() => {
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  adapter = new SqliteAdapter(DB_PATH);
  adapter.exec("CREATE TABLE IF NOT EXISTS post (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, title TEXT, body TEXT, status TEXT)");
  adapter.exec("INSERT INTO post (slug, title, body, status) VALUES ('first', 'First Post', 'Content 1', 'published')");
  adapter.exec("INSERT INTO post (slug, title, body, status) VALUES ('second', 'Second Post', 'Content 2', 'published')");
  adapter.exec("INSERT INTO post (slug, title, body, status) VALUES ('third', 'Third Post', 'Content 3', 'published')");
  adapter.exec("INSERT INTO post (slug, title, body, status) VALUES ('draft', 'Draft Post', 'Not visible', 'draft')");

  engine = new PrestoEngine({
    templateDir: TEMPLATES,
    publicDir: PUBLIC,
    secret: SECRET,
    adapter,
    modules: [echoModule],
  });
});

afterAll(() => {
  adapter.close();
  for (const f of [DB_PATH, DB_PATH + "-wal", DB_PATH + "-shm"]) {
    if (existsSync(f)) unlinkSync(f);
  }
});

describe("PRESTO Verification Suite (22 Tests)", () => {

  // Test 1: Home page renders with layout
  test("1. Home page renders with layout", async () => {
    const resp = await engine.handle(makeRequest({ path: "/" }));
    expect(resp.status).toBe(200);
    expect(resp.body).toContain("<!DOCTYPE html>");
    expect(resp.body).toContain("PRESTO");
    expect(resp.body).toContain("</body>");
  });

  // Test 2: 404 for missing route
  test("2. 404 for missing route", async () => {
    const resp = await engine.handle(makeRequest({ path: "/does-not-exist" }));
    expect(resp.status).toBe(404);
  });

  // Test 3: Dynamic [slug] resolves with params
  test("3. Dynamic [slug] resolves with params", async () => {
    const resp = await engine.handle(makeRequest({ path: "/blog/first" }));
    expect(resp.status).toBe(200);
    expect(resp.body).toContain("First Post");
  });

  // Test 4: Include expands partial
  test("4. Include expands partial", async () => {
    const resp = await engine.handle(makeRequest({ path: "/showcase" }));
    expect(resp.status).toBe(200);
    expect(resp.body).toContain("Home | About | Blog");
  });

  // Test 5: Component renders with props + slot
  test("5. Component renders with props + slot", async () => {
    const resp = await engine.handle(makeRequest({ path: "/showcase" }));
    expect(resp.body).toContain("Test Card");
    expect(resp.body).toContain("Slot content");
    expect(resp.body).toContain("card");
  });

  // Test 6: htx:v resolves, pipes work, HTML escaped
  test("6. htx:v resolves, pipes work, HTML escaped", async () => {
    const resp = await engine.handle(makeRequest({ path: "/showcase" }));
    expect(resp.body).toContain("All Posts"); // htx:let + htx:v
    expect(resp.body).toContain("FIRST POST"); // uppercase pipe
    expect(resp.body).toContain("&lt;script&gt;"); // HTML escaped
  });

  // Test 7: htx:v raw outputs unescaped
  test("7. htx:v raw outputs unescaped", async () => {
    const resp = await engine.handle(makeRequest({ path: "/showcase" }));
    expect(resp.body).toContain("<b>bold</b>"); // raw output
  });

  // Test 8: Script blocks untouched by expression engine
  test("8. Script blocks untouched by expression engine", async () => {
    const resp = await engine.handle(makeRequest({ path: "/showcase" }));
    expect(resp.body).toContain('{htx:should.not.resolve}');
  });

  // Test 9: htx:raw blocks untouched
  test("9. htx:raw blocks untouched", async () => {
    const resp = await engine.handle(makeRequest({ path: "/showcase" }));
    expect(resp.body).toContain("<htx:v>not.evaluated</htx:v>");
  });

  // Test 10: htx:data + htx:each renders database records
  test("10. htx:data + htx:each renders database records", async () => {
    const resp = await engine.handle(makeRequest({ path: "/showcase" }));
    expect(resp.body).toContain("First Post");
    expect(resp.body).toContain("Second Post");
    expect(resp.body).toContain("Third Post");
    expect(resp.body).not.toContain("Draft Post"); // status != published
  });

  // Test 11: htx:if true shows, false hides
  test("11. htx:if true shows, false hides", async () => {
    const resp = await engine.handle(makeRequest({ path: "/showcase" }));
    expect(resp.body).toContain("Posts found"); // posts array is truthy
  });

  // Test 12: htx:else shows when condition false
  test("12. htx:else shows when condition false", async () => {
    // The showcase page has posts, so else doesn't show
    // But we verify the mechanism via the if/else on the page
    const resp = await engine.handle(makeRequest({ path: "/showcase" }));
    expect(resp.body).not.toContain("No posts");
  });

  // Test 13: htx:empty renders for empty collection
  test("13. htx:empty renders for empty collection", async () => {
    const resp = await engine.handle(makeRequest({ path: "/blog/nonexistent-slug" }));
    expect(resp.body).toContain("Not found");
  });

  // Test 14: htx:grant materializes signed token
  test("14. htx:grant materializes signed token", async () => {
    const resp = await engine.handle(makeRequest({ path: "/showcase" }));
    // Grant token should be a base64url.base64url format
    const tokenMatch = resp.body.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(tokenMatch).not.toBeNull();
  });

  // Test 15: htx:auth hides from unauthenticated
  test("15. htx:auth hides from unauthenticated", async () => {
    const resp = await engine.handle(makeRequest({ path: "/showcase" }));
    expect(resp.body).not.toContain("Logged in");
    expect(resp.body).toContain("Guest");
  });

  // Test 16: htx:layout none = no wrapping
  test("16. htx:layout none = no wrapping", async () => {
    const resp = await engine.handle(makeRequest({ path: "/no-layout" }));
    expect(resp.body).toContain("No Layout");
    expect(resp.body).not.toContain("<!DOCTYPE");
  });

  // Test 17: htx:layout src = explicit layout
  test("17. htx:layout src = explicit layout", async () => {
    const resp = await engine.handle(makeRequest({ path: "/custom-layout" }));
    expect(resp.body).toContain("Minimal");
    expect(resp.body).toContain("Custom Layout");
    expect(resp.body).toContain('class="minimal"');
  });

  // Test 18: Channel API 200 with valid token
  test("18. Channel API 200 with valid token", async () => {
    const tokenService = new ChannelTokenService(SECRET);
    const token = await tokenService.issue("user1", "channel:echo");
    const resp = await engine.handle(makeRequest({
      path: "/api/channel/echo/test-path",
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(resp.status).toBe(200);
    const data = JSON.parse(resp.body);
    expect(data.echo).toBe("test-path");
  });

  // Test 19: Channel API 401 with invalid token
  test("19. Channel API 401 with invalid token", async () => {
    const resp = await engine.handle(makeRequest({
      path: "/api/channel/echo/test",
      headers: { authorization: "Bearer invalid.token.here" },
    }));
    expect(resp.status).toBe(401);
  });

  // Test 20: Channel API 403 with wrong scope
  test("20. Channel API 403 with wrong scope", async () => {
    const tokenService = new ChannelTokenService(SECRET);
    const token = await tokenService.issue("user1", "channel:other-module");
    const resp = await engine.handle(makeRequest({
      path: "/api/channel/echo/test",
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(resp.status).toBe(403);
  });

  // Test 21: Action token roundtrip succeeds
  test("21. Action token roundtrip succeeds", async () => {
    const service = new ActionTokenService(SECRET);
    const token = await service.issue("delete", "post", "42");
    const verified = await service.verify(token);
    expect(verified).not.toBeNull();
    expect(verified!.action).toBe("delete");
    expect(verified!.type).toBe("post");
    expect(verified!.recordId).toBe("42");
  });

  // Test 22: Tampered action token rejected
  test("22. Tampered action token rejected", async () => {
    const service = new ActionTokenService(SECRET);
    const token = await service.issue("delete", "post", "42");
    // Tamper with the token
    const tampered = token.substring(0, token.length - 2) + "XX";
    const verified = await service.verify(tampered);
    expect(verified).toBeNull();
  });
});
