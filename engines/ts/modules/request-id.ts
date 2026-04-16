// Module Kit — Request ID
// Generates a UUID per request. Sets X-Request-ID header. Injects requestId into data context.

import type { HtxModule, ModuleManifest, ModuleRegistry, Middleware, ContextProvider, HtxRequest, HtxResponse } from "../src/types";

export function createRequestIdModule(): HtxModule {
  return {
    name: () => "request-id",
    manifest: (): ModuleManifest => ({
      trust: "first-party",
      middleware: ["request-id"],
      contextProviders: ["request-id"],
    }),
    boot: (registry: ModuleRegistry) => {
      registry.registerMiddleware(new RequestIdMiddleware());
      registry.registerContextProvider(new RequestIdContextProvider());
    },
  };
}

class RequestIdMiddleware implements Middleware {
  name() { return "request-id"; }
  handle(request: HtxRequest, next: () => HtxResponse): HtxResponse {
    const id = crypto.randomUUID();
    (request as any)._requestId = id;
    const resp = next();
    resp.headers["X-Request-ID"] = id;
    return resp;
  }
}

class RequestIdContextProvider implements ContextProvider {
  name() { return "request-id"; }
  resolve(request: HtxRequest): Record<string, unknown> {
    return { requestId: (request as any)._requestId || "" };
  }
}
