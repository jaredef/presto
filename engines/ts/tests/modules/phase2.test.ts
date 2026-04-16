// Module Kit Phase 2 Tests — session, flash, rate-limit, cache

import { describe, test, expect } from "bun:test";
import { createSessionModule } from "../../modules/session";
import { createFlashModule } from "../../modules/flash";
import { createRateLimitModule } from "../../modules/rate-limit";
import { createCacheModule } from "../../modules/cache";
import { tokenSign } from "../../src/security/hmac";
import { HtxResponse } from "../../src/types";
import type { HtxRequest, Middleware, ContextProvider, ModuleRegistry } from "../../src/types";

const SECRET = "module-kit-test-secret";

function mockRequest(overrides: Partial<HtxRequest> = {}): HtxRequest {
  return { method: "GET", path: "/", query: {}, headers: {}, cookies: {}, body: {}, bodyRaw: "", contentType: "", hxRequest: false, auth: null, ...overrides };
}

function mockNext(): HtxResponse { return HtxResponse.html("<h1>OK</h1>"); }

function collect(mod: any) {
  const mws: Middleware[] = [];
  const cps: ContextProvider[] = [];
  const registry: ModuleRegistry = {
    registerMiddleware: (mw: Middleware) => mws.push(mw),
    registerContextProvider: (cp: ContextProvider) => cps.push(cp),
    registerChannelHandler: () => {},
    registerTemplateProcessor: () => {},
  };
  mod.boot(registry);
  return { mws, cps };
}

describe("Session Module", () => {
  test("registers middleware and context provider", () => {
    const { mws, cps } = collect(createSessionModule({ secret: SECRET }));
    expect(mws.length).toBe(1);
    expect(cps.length).toBe(1);
  });

  test("decodes valid session cookie into context", async () => {
    const token = await tokenSign({ name: "Alice", role: "admin", exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const { mws, cps } = collect(createSessionModule({ secret: SECRET }));
    const req = mockRequest({ cookies: { htx_session: token } });
    mws[0].handle(req, mockNext);
    const ctx = cps[0].resolve(req);
    expect((ctx.session as any).name).toBe("Alice");
    expect((ctx.session as any).role).toBe("admin");
  });

  test("ignores expired session", async () => {
    const token = await tokenSign({ name: "Bob", exp: Math.floor(Date.now() / 1000) - 60 }, SECRET);
    const { mws, cps } = collect(createSessionModule({ secret: SECRET }));
    const req = mockRequest({ cookies: { htx_session: token } });
    mws[0].handle(req, mockNext);
    const ctx = cps[0].resolve(req);
    expect(ctx.session).toBeUndefined();
  });

  test("no session when cookie missing", () => {
    const { mws, cps } = collect(createSessionModule({ secret: SECRET }));
    const req = mockRequest();
    mws[0].handle(req, mockNext);
    const ctx = cps[0].resolve(req);
    expect(ctx.session).toBeUndefined();
  });
});

describe("Flash Module", () => {
  test("reads flash from session data", async () => {
    const token = await tokenSign({ flash: { type: "success", message: "Created!" }, exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    const sessionMod = createSessionModule({ secret: SECRET });
    const flashMod = createFlashModule();
    const sessionReg = collect(sessionMod);
    const flashReg = collect(flashMod);

    const req = mockRequest({ cookies: { htx_session: token } });
    // Session middleware first
    sessionReg.mws[0].handle(req, mockNext);
    // Then flash middleware
    flashReg.mws[0].handle(req, mockNext);
    // Flash context
    const ctx = flashReg.cps[0].resolve(req);
    expect((ctx.flash as any).type).toBe("success");
    expect((ctx.flash as any).message).toBe("Created!");
  });

  test("no flash when session has none", () => {
    const { mws, cps } = collect(createFlashModule());
    const req = mockRequest();
    mws[0].handle(req, mockNext);
    const ctx = cps[0].resolve(req);
    expect(ctx.flash).toBeUndefined();
  });
});

describe("Rate Limit Module", () => {
  test("allows requests within limit", () => {
    const { mws } = collect(createRateLimitModule({ max: 5, windowMs: 60000, keyFn: () => "test-key-1" }));
    for (let i = 0; i < 5; i++) {
      const resp = mws[0].handle(mockRequest(), mockNext);
      expect(resp.status).toBe(200);
    }
  });

  test("returns 429 when limit exceeded", () => {
    const { mws } = collect(createRateLimitModule({ max: 3, windowMs: 60000, keyFn: () => "test-key-2" }));
    for (let i = 0; i < 3; i++) {
      mws[0].handle(mockRequest(), mockNext);
    }
    const resp = mws[0].handle(mockRequest(), mockNext);
    expect(resp.status).toBe(429);
  });

  test("sets rate limit headers", () => {
    const { mws } = collect(createRateLimitModule({ max: 10, windowMs: 60000, keyFn: () => "test-key-3" }));
    const resp = mws[0].handle(mockRequest(), mockNext);
    expect(resp.headers["X-RateLimit-Limit"]).toBe("10");
    expect(resp.headers["X-RateLimit-Remaining"]).toBeDefined();
  });

  test("different keys have independent limits", () => {
    let callCount = 0;
    const { mws } = collect(createRateLimitModule({
      max: 2, windowMs: 60000,
      keyFn: () => `key-${callCount++}`,
    }));
    // Each call gets a unique key, so none should be rate limited
    for (let i = 0; i < 10; i++) {
      const resp = mws[0].handle(mockRequest(), mockNext);
      expect(resp.status).toBe(200);
    }
  });
});

describe("Cache Module", () => {
  test("adds Cache-Control header when TTL > 0", () => {
    const { mws } = collect(createCacheModule({ defaultTtl: 3600 }));
    const resp = mws[0].handle(mockRequest(), mockNext);
    expect(resp.headers["Cache-Control"]).toBe("public, max-age=3600");
  });

  test("no Cache-Control when TTL is 0", () => {
    const { mws } = collect(createCacheModule({ defaultTtl: 0 }));
    const resp = mws[0].handle(mockRequest(), mockNext);
    expect(resp.headers["Cache-Control"]).toBeUndefined();
  });

  test("generates ETag header", () => {
    const { mws } = collect(createCacheModule({ etag: true }));
    const resp = mws[0].handle(mockRequest(), mockNext);
    expect(resp.headers["ETag"]).toBeDefined();
    expect(resp.headers["ETag"]).toMatch(/^"[0-9a-f]+"$/);
  });

  test("returns 304 when If-None-Match matches ETag", () => {
    const { mws } = collect(createCacheModule({ etag: true }));
    // First request to get the ETag
    const resp1 = mws[0].handle(mockRequest(), mockNext);
    const etag = resp1.headers["ETag"];
    // Second request with matching If-None-Match
    const resp2 = mws[0].handle(mockRequest({ headers: { "if-none-match": etag } }), mockNext);
    expect(resp2.status).toBe(304);
  });

  test("rule-based TTL overrides default", () => {
    const { mws } = collect(createCacheModule({
      defaultTtl: 0,
      rules: [{ pattern: "/static", ttl: 86400 }],
    }));
    const resp = mws[0].handle(mockRequest({ path: "/static/app.css" }), mockNext);
    expect(resp.headers["Cache-Control"]).toBe("public, max-age=86400");
  });
});
