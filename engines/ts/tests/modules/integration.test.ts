// Module Kit Integration Tests
// Verify modules compose without conflicts when loaded together

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrestoEngine } from "../../src/engine";
import { SqliteAdapter } from "../../src/adapters/sqlite";
import {
  createRequestIdModule,
  createLoggerModule,
  createCorsModule,
  createSecurityModule,
  createRateLimitModule,
  createCacheModule,
  createAuthModule,
  createErrorHandlerModule,
  createHealthModule,
  createStaticAssetsModule,
} from "../../modules/index";
import { tokenSign } from "../../src/security/hmac";
import { join } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import type { HtxRequest } from "../../src/types";

const TEMPLATES = join(import.meta.dir, "../../templates");
const PUBLIC = join(import.meta.dir, "../../public");
const DB_PATH = join(import.meta.dir, "integration-modules.sqlite");
const SECRET = "integration-test-secret";

let adapter: SqliteAdapter;
let engine: PrestoEngine;

function req(overrides: Partial<HtxRequest> = {}): HtxRequest {
  return { method: "GET", path: "/", query: {}, headers: {}, cookies: {}, body: {}, bodyRaw: "", contentType: "", hxRequest: false, auth: null, ...overrides };
}

beforeAll(() => {
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  adapter = new SqliteAdapter(DB_PATH);
  adapter.exec("CREATE TABLE IF NOT EXISTS post (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, title TEXT, body TEXT, status TEXT)");
  adapter.exec("INSERT INTO post (slug, title, body, status) VALUES ('test', 'Test Post', 'Content', 'published')");

  engine = new PrestoEngine({
    templateDir: TEMPLATES,
    publicDir: PUBLIC,
    secret: SECRET,
    adapter,
    modules: [
      createErrorHandlerModule({ devMode: false }),
      createRequestIdModule(),
      createLoggerModule({ colorize: false, filter: (p) => p !== "/healthz" }),
      createCorsModule({ origins: "https://example.com" }),
      createSecurityModule(),
      createRateLimitModule({ max: 1000, keyFn: () => "integration-test" }),
      createCacheModule({ etag: true }),
      createAuthModule({ secret: SECRET, adapter }),
      createHealthModule({ checks: [{ name: "db", check: () => ({ status: "ok" as const }) }] }),
      createStaticAssetsModule({ publicDir: PUBLIC }),
    ],
  });
});

afterAll(() => {
  adapter.close();
  for (const f of [DB_PATH, DB_PATH + "-wal", DB_PATH + "-shm"]) {
    if (existsSync(f)) unlinkSync(f);
  }
});

describe("Module Kit Integration", () => {

  test("all modules load without name collision", async () => {
    // The engine booted successfully with 10 modules — if there were collisions, boot would fail
    const resp = await engine.handle(req({ path: "/showcase" }));
    expect(resp.status).toBe(200);
  });

  test("request has CORS + security + rate-limit + cache headers", async () => {
    const resp = await engine.handle(req({ path: "/showcase" }));
    expect(resp.headers["Access-Control-Allow-Origin"]).toBe("https://example.com");
    expect(resp.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(resp.headers["X-RateLimit-Limit"]).toBe("1000");
    expect(resp.headers["ETag"]).toBeDefined();
  });

  test("request has X-Request-ID", async () => {
    const resp = await engine.handle(req({ path: "/showcase" }));
    expect(resp.headers["X-Request-ID"]).toBeDefined();
    expect(resp.headers["X-Request-ID"].length).toBe(36); // UUID
  });

  test("authenticated request populates auth in templates", async () => {
    const token = await tokenSign({
      sub: "1", username: "testuser", role: "admin",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, SECRET);

    const resp = await engine.handle(req({
      path: "/showcase",
      cookies: { htx_session: token },
    }));
    expect(resp.body).toContain("Logged in"); // htx:auth block should render
    expect(resp.body).not.toContain("Guest"); // htx:unauth should NOT render
  });

  test("unauthenticated request shows guest content", async () => {
    const resp = await engine.handle(req({ path: "/showcase" }));
    expect(resp.body).not.toContain("Logged in");
    expect(resp.body).toContain("Guest");
  });

  test("health endpoint returns status with custom checks", async () => {
    const resp = await engine.handle(req({ path: "/healthz" }));
    expect(resp.status).toBe(200);
    const data = JSON.parse(resp.body);
    expect(data.status).toBe("ok");
    expect(data.checks[0].name).toBe("db");
  });

  test("304 response when ETag matches", async () => {
    const resp1 = await engine.handle(req({ path: "/showcase" }));
    const etag = resp1.headers["ETag"];
    expect(etag).toBeDefined();

    const resp2 = await engine.handle(req({
      path: "/showcase",
      headers: { "if-none-match": etag },
    }));
    expect(resp2.status).toBe(304);
  });

  test("unique request IDs per request", async () => {
    const resp1 = await engine.handle(req());
    const resp2 = await engine.handle(req());
    expect(resp1.headers["X-Request-ID"]).not.toBe(resp2.headers["X-Request-ID"]);
  });

  test("engine still passes 22-test verification (no regression)", async () => {
    // Spot check critical verification tests
    const notFound = await engine.handle(req({ path: "/does-not-exist" }));
    expect(notFound.status).toBe(404);

    const showcase = await engine.handle(req({ path: "/showcase" }));
    expect(showcase.body).toContain("All Posts"); // htx:let + htx:v
    expect(showcase.body).toContain('{htx:should.not.resolve}'); // script opacity
  });
});
