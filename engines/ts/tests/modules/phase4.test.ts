// Module Kit Phase 4 — error-handler, health, static-assets

import { describe, test, expect } from "bun:test";
import { createErrorHandlerModule } from "../../modules/error-handler";
import { createHealthModule } from "../../modules/health";
import { createStaticAssetsModule } from "../../modules/static-assets";
import { HtxResponse } from "../../src/types";
import { join } from "node:path";
import type { HtxRequest, Middleware, ContextProvider, ModuleRegistry } from "../../src/types";

function mockRequest(overrides: Partial<HtxRequest> = {}): HtxRequest {
  return { method: "GET", path: "/", query: {}, headers: {}, cookies: {}, body: {}, bodyRaw: "", contentType: "", hxRequest: false, auth: null, ...overrides };
}
function mockNext(): HtxResponse { return HtxResponse.html("<h1>OK</h1>"); }
function throwingNext(): HtxResponse { throw new Error("Something broke"); }

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

describe("Error Handler Module", () => {
  test("passes through successful responses", () => {
    const { mws } = collect(createErrorHandlerModule({ devMode: true }));
    const resp = mws[0].handle(mockRequest(), mockNext);
    expect(resp.status).toBe(200);
    expect(resp.body).toContain("OK");
  });

  test("catches errors and returns 500 in dev mode", () => {
    const { mws } = collect(createErrorHandlerModule({ devMode: true }));
    const resp = mws[0].handle(mockRequest(), throwingNext);
    expect(resp.status).toBe(500);
    expect(resp.body).toContain("Something broke");
    expect(resp.body).toContain("Pipeline Error");
  });

  test("catches errors with clean page in production", () => {
    const { mws } = collect(createErrorHandlerModule({ devMode: false }));
    const resp = mws[0].handle(mockRequest(), throwingNext);
    expect(resp.status).toBe(500);
    expect(resp.body).not.toContain("Something broke"); // no stack trace
    expect(resp.body).toContain("Internal Server Error");
  });
});

describe("Health Module", () => {
  test("returns health status on /healthz", () => {
    const { mws } = collect(createHealthModule());
    const resp = mws[0].handle(mockRequest({ path: "/healthz" }), mockNext);
    expect(resp.status).toBe(200);
    const data = JSON.parse(resp.body);
    expect(data.status).toBe("ok");
    expect(data.uptime).toBeGreaterThanOrEqual(0);
    expect(data.memory.rss).toBeGreaterThan(0);
  });

  test("passes through non-health paths", () => {
    const { mws } = collect(createHealthModule());
    const resp = mws[0].handle(mockRequest({ path: "/" }), mockNext);
    expect(resp.status).toBe(200);
    expect(resp.body).toContain("OK");
  });

  test("custom path", () => {
    const { mws } = collect(createHealthModule({ path: "/_health" }));
    const resp = mws[0].handle(mockRequest({ path: "/_health" }), mockNext);
    expect(resp.status).toBe(200);
    expect(JSON.parse(resp.body).status).toBe("ok");
  });

  test("runs custom checks", () => {
    const { mws } = collect(createHealthModule({
      checks: [
        { name: "db", check: () => ({ status: "ok", message: "connected" }) },
      ],
    }));
    const resp = mws[0].handle(mockRequest({ path: "/healthz" }), mockNext);
    const data = JSON.parse(resp.body);
    expect(data.checks.length).toBe(1);
    expect(data.checks[0].name).toBe("db");
    expect(data.checks[0].status).toBe("ok");
  });

  test("returns 503 when a check fails", () => {
    const { mws } = collect(createHealthModule({
      checks: [
        { name: "db", check: () => ({ status: "fail", message: "connection refused" }) },
      ],
    }));
    const resp = mws[0].handle(mockRequest({ path: "/healthz" }), mockNext);
    expect(resp.status).toBe(503);
    expect(JSON.parse(resp.body).status).toBe("degraded");
  });
});

describe("Static Assets Module", () => {
  const PUBLIC = join(import.meta.dir, "../../public");

  test("registers context provider", () => {
    const { cps } = collect(createStaticAssetsModule({ publicDir: PUBLIC }));
    expect(cps.length).toBe(1);
    expect(cps[0].name()).toBe("static-assets");
  });

  test("asset() returns versioned URL for known files", () => {
    const { cps } = collect(createStaticAssetsModule({ publicDir: PUBLIC }));
    const ctx = cps[0].resolve(mockRequest());
    const asset = ctx.asset as (path: string) => string;
    const url = asset("/css/presto-ui.css");
    expect(url).toContain("/css/presto-ui.css?v=");
  });

  test("asset() returns unversioned URL for unknown files", () => {
    const { cps } = collect(createStaticAssetsModule({ publicDir: PUBLIC }));
    const ctx = cps[0].resolve(mockRequest());
    const asset = ctx.asset as (path: string) => string;
    expect(asset("/nonexistent.css")).toBe("/nonexistent.css");
  });
});
