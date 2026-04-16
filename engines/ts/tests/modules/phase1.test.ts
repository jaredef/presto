// Module Kit Phase 1 Tests — request-id, logger, cors, security

import { describe, test, expect } from "bun:test";
import { createRequestIdModule } from "../../modules/request-id";
import { createLoggerModule } from "../../modules/logger";
import { createCorsModule } from "../../modules/cors";
import { createSecurityModule } from "../../modules/security";
import { HtxResponse } from "../../src/types";
import type { HtxRequest, Middleware, ContextProvider, ModuleRegistry } from "../../src/types";

function mockRequest(overrides: Partial<HtxRequest> = {}): HtxRequest {
  return { method: "GET", path: "/", query: {}, headers: {}, cookies: {}, body: {}, bodyRaw: "", contentType: "", hxRequest: false, auth: null, ...overrides };
}

function mockNext(): HtxResponse {
  return HtxResponse.html("<h1>OK</h1>");
}

function collectRegistrations(mod: ReturnType<typeof createRequestIdModule>) {
  const mws: Middleware[] = [];
  const cps: ContextProvider[] = [];
  const registry: ModuleRegistry = {
    registerMiddleware: (mw) => mws.push(mw),
    registerContextProvider: (cp) => cps.push(cp),
    registerChannelHandler: () => {},
    registerTemplateProcessor: () => {},
  };
  mod.boot(registry);
  return { mws, cps };
}

describe("Request ID Module", () => {
  test("registers middleware and context provider", () => {
    const { mws, cps } = collectRegistrations(createRequestIdModule());
    expect(mws.length).toBe(1);
    expect(cps.length).toBe(1);
    expect(mws[0].name()).toBe("request-id");
    expect(cps[0].name()).toBe("request-id");
  });

  test("middleware sets X-Request-ID header", () => {
    const { mws } = collectRegistrations(createRequestIdModule());
    const req = mockRequest();
    const resp = mws[0].handle(req, mockNext);
    expect(resp.headers["X-Request-ID"]).toBeDefined();
    expect(resp.headers["X-Request-ID"].length).toBeGreaterThan(0);
  });

  test("context provider exposes requestId", () => {
    const { mws, cps } = collectRegistrations(createRequestIdModule());
    const req = mockRequest();
    mws[0].handle(req, mockNext); // populates _requestId
    const ctx = cps[0].resolve(req);
    expect(ctx.requestId).toBeDefined();
    expect(typeof ctx.requestId).toBe("string");
  });

  test("each request gets a unique ID", () => {
    const { mws } = collectRegistrations(createRequestIdModule());
    const r1 = mockRequest();
    const r2 = mockRequest();
    const resp1 = mws[0].handle(r1, mockNext);
    const resp2 = mws[0].handle(r2, mockNext);
    expect(resp1.headers["X-Request-ID"]).not.toBe(resp2.headers["X-Request-ID"]);
  });
});

describe("Logger Module", () => {
  test("registers middleware", () => {
    const { mws } = collectRegistrations(createLoggerModule({ colorize: false }));
    expect(mws.length).toBe(1);
    expect(mws[0].name()).toBe("logger");
  });

  test("calls next and returns its response", () => {
    const { mws } = collectRegistrations(createLoggerModule({ colorize: false }));
    const resp = mws[0].handle(mockRequest(), mockNext);
    expect(resp.status).toBe(200);
    expect(resp.body).toContain("OK");
  });

  test("filter skips excluded paths", () => {
    const { mws } = collectRegistrations(createLoggerModule({
      colorize: false,
      filter: (path) => path !== "/healthz",
    }));
    const resp = mws[0].handle(mockRequest({ path: "/healthz" }), mockNext);
    expect(resp.status).toBe(200);
  });
});

describe("CORS Module", () => {
  test("adds CORS headers to responses", () => {
    const { mws } = collectRegistrations(createCorsModule({ origins: "https://example.com" }));
    const resp = mws[0].handle(mockRequest(), mockNext);
    expect(resp.headers["Access-Control-Allow-Origin"]).toBe("https://example.com");
    expect(resp.headers["Access-Control-Allow-Methods"]).toContain("GET");
  });

  test("handles OPTIONS preflight with 204", () => {
    const { mws } = collectRegistrations(createCorsModule());
    const resp = mws[0].handle(mockRequest({ method: "OPTIONS" }), mockNext);
    expect(resp.status).toBe(204);
    expect(resp.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(resp.headers["Access-Control-Max-Age"]).toBe("86400");
  });

  test("sets credentials header when enabled", () => {
    const { mws } = collectRegistrations(createCorsModule({ credentials: true }));
    const resp = mws[0].handle(mockRequest(), mockNext);
    expect(resp.headers["Access-Control-Allow-Credentials"]).toBe("true");
  });

  test("no credentials header when disabled", () => {
    const { mws } = collectRegistrations(createCorsModule({ credentials: false }));
    const resp = mws[0].handle(mockRequest(), mockNext);
    expect(resp.headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });
});

describe("Security Headers Module", () => {
  test("adds default security headers", () => {
    const { mws } = collectRegistrations(createSecurityModule());
    const resp = mws[0].handle(mockRequest(), mockNext);
    expect(resp.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(resp.headers["X-Frame-Options"]).toBe("DENY");
    expect(resp.headers["X-XSS-Protection"]).toBe("0");
    expect(resp.headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(resp.headers["Strict-Transport-Security"]).toContain("max-age=31536000");
  });

  test("custom CSP header", () => {
    const { mws } = collectRegistrations(createSecurityModule({ csp: "default-src 'self'" }));
    const resp = mws[0].handle(mockRequest(), mockNext);
    expect(resp.headers["Content-Security-Policy"]).toBe("default-src 'self'");
  });

  test("HSTS disabled when false", () => {
    const { mws } = collectRegistrations(createSecurityModule({ hsts: false }));
    const resp = mws[0].handle(mockRequest(), mockNext);
    expect(resp.headers["Strict-Transport-Security"]).toBeUndefined();
  });
});
