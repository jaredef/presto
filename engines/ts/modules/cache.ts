// Module Kit — Cache
// Cache-Control headers + ETag generation + 304 conditional responses.

import type { HtxModule, ModuleManifest, ModuleRegistry, HtxRequest, HtxResponse } from "../src/types";
import { HtxResponse as HtxResp } from "../src/types";

export interface CacheOptions {
  defaultTtl?: number;
  etag?: boolean;
  rules?: Array<{ pattern: string | RegExp; ttl: number }>;
}

export function createCacheModule(options: CacheOptions = {}): HtxModule {
  const config = {
    defaultTtl: options.defaultTtl ?? 0,
    etag: options.etag ?? true,
    rules: options.rules ?? [],
  };

  return {
    name: () => "cache",
    manifest: (): ModuleManifest => ({ trust: "first-party", middleware: ["cache"] }),
    boot: (registry: ModuleRegistry) => {
      registry.registerMiddleware({
        name: () => "cache",
        handle(request: HtxRequest, next: () => HtxResponse): HtxResponse {
          const resp = next();

          // Determine TTL from rules or default
          let ttl = config.defaultTtl;
          for (const rule of config.rules) {
            const matches = typeof rule.pattern === "string"
              ? request.path.startsWith(rule.pattern)
              : rule.pattern.test(request.path);
            if (matches) { ttl = rule.ttl; break; }
          }

          if (ttl > 0) {
            resp.headers["Cache-Control"] = `public, max-age=${ttl}`;
          }

          // ETag
          if (config.etag && resp.body) {
            const hash = Bun.hash(resp.body).toString(16);
            const etag = `"${hash}"`;
            resp.headers["ETag"] = etag;

            // Check If-None-Match
            const ifNoneMatch = request.headers["if-none-match"];
            if (ifNoneMatch === etag) {
              return new HtxResp(304, resp.contentType, "", resp.headers);
            }
          }

          return resp;
        },
      });
    },
  };
}
