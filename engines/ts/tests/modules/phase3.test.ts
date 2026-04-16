// Module Kit Phase 3 — Auth module tests

import { describe, test, expect } from "bun:test";
import { createAuthModule, createAuthSession, verifyAuthSession, hashPassword, verifyPassword } from "../../modules/auth";
import { HtxResponse } from "../../src/types";
import { tokenSign } from "../../src/security/hmac";
import type { HtxRequest, Middleware, ContextProvider, ModuleRegistry } from "../../src/types";

const SECRET = "auth-module-test-secret";

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

describe("Auth Module", () => {
  test("registers middleware and context provider", () => {
    const { mws, cps } = collect(createAuthModule({ secret: SECRET }));
    expect(mws.length).toBe(1);
    expect(cps.length).toBe(1);
    expect(mws[0].name()).toBe("auth-session");
    expect(cps[0].name()).toBe("auth");
  });

  test("populates request.auth from valid session cookie", async () => {
    const token = await tokenSign({
      sub: "123", username: "alice", role: "admin",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, SECRET);

    const { mws, cps } = collect(createAuthModule({ secret: SECRET }));
    const req = mockRequest({ cookies: { htx_session: token } });
    mws[0].handle(req, mockNext);

    expect(req.auth).not.toBeNull();
    expect(req.auth!.user.id).toBe("123");
    expect(req.auth!.user.name).toBe("alice");
    expect(req.auth!.user.role).toBe("admin");
  });

  test("context provider injects auth into data context", async () => {
    const token = await tokenSign({
      sub: "456", username: "bob", role: "user",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, SECRET);

    const { mws, cps } = collect(createAuthModule({ secret: SECRET }));
    const req = mockRequest({ cookies: { htx_session: token } });
    mws[0].handle(req, mockNext);
    const ctx = cps[0].resolve(req);

    expect((ctx.auth as any).user.name).toBe("bob");
  });

  test("expired cookie leaves auth null", async () => {
    const token = await tokenSign({
      sub: "789", username: "expired", role: "user",
      exp: Math.floor(Date.now() / 1000) - 60,
    }, SECRET);

    const { mws } = collect(createAuthModule({ secret: SECRET }));
    const req = mockRequest({ cookies: { htx_session: token } });
    mws[0].handle(req, mockNext);
    expect(req.auth).toBeNull();
  });

  test("no cookie leaves auth null", () => {
    const { mws } = collect(createAuthModule({ secret: SECRET }));
    const req = mockRequest();
    mws[0].handle(req, mockNext);
    expect(req.auth).toBeNull();
  });

  test("invalid cookie leaves auth null", () => {
    const { mws } = collect(createAuthModule({ secret: SECRET }));
    const req = mockRequest({ cookies: { htx_session: "garbage.token" } });
    mws[0].handle(req, mockNext);
    expect(req.auth).toBeNull();
  });
});

describe("Auth Utilities", () => {
  test("createAuthSession + verifyAuthSession roundtrip", async () => {
    const token = await createAuthSession("42", "carol", "admin", SECRET);
    const verified = await verifyAuthSession(token, SECRET);
    expect(verified).not.toBeNull();
    expect(verified!.userId).toBe("42");
    expect(verified!.username).toBe("carol");
    expect(verified!.role).toBe("admin");
  });

  test("wrong secret rejects session", async () => {
    const token = await createAuthSession("42", "carol", "admin", SECRET);
    const verified = await verifyAuthSession(token, "wrong-secret");
    expect(verified).toBeNull();
  });

  test("hashPassword + verifyPassword roundtrip", async () => {
    const hash = await hashPassword("my-secure-password");
    expect(await verifyPassword("my-secure-password", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});
