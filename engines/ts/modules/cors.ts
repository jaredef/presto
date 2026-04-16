// Module Kit — CORS
// Sets Access-Control headers. Handles OPTIONS preflight.

import type { HtxModule, ModuleManifest, ModuleRegistry, Middleware, HtxRequest, HtxResponse } from "../src/types";
import { HtxResponse as HtxResp } from "../src/types";

export interface CorsOptions {
  origins?: string | string[];
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
}

export function createCorsModule(options: CorsOptions = {}): HtxModule {
  const config = {
    origins: options.origins ?? "*",
    methods: options.methods ?? ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    headers: options.headers ?? ["Content-Type", "Authorization"],
    credentials: options.credentials ?? false,
    maxAge: options.maxAge ?? 86400,
  };

  const originStr = Array.isArray(config.origins) ? config.origins.join(", ") : config.origins;

  return {
    name: () => "cors",
    manifest: (): ModuleManifest => ({ trust: "first-party", middleware: ["cors"] }),
    boot: (registry: ModuleRegistry) => {
      registry.registerMiddleware({
        name: () => "cors",
        handle(request: HtxRequest, next: () => HtxResponse): HtxResponse {
          // Preflight
          if (request.method === "OPTIONS") {
            const resp = new HtxResp(204, "text/plain", "");
            addCorsHeaders(resp);
            resp.headers["Access-Control-Max-Age"] = String(config.maxAge);
            return resp;
          }
          const resp = next();
          addCorsHeaders(resp);
          return resp;
        },
      });
    },
  };

  function addCorsHeaders(resp: HtxResponse) {
    resp.headers["Access-Control-Allow-Origin"] = originStr;
    resp.headers["Access-Control-Allow-Methods"] = config.methods.join(", ");
    resp.headers["Access-Control-Allow-Headers"] = config.headers.join(", ");
    if (config.credentials) resp.headers["Access-Control-Allow-Credentials"] = "true";
  }
}
