// Module Kit — Rate Limit
// In-memory sliding window rate limiter. Returns 429 when exceeded.

import type { HtxModule, ModuleManifest, ModuleRegistry, HtxRequest, HtxResponse } from "../src/types";
import { HtxResponse as HtxResp } from "../src/types";

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  keyFn?: (request: HtxRequest) => string;
  message?: string;
}

export function createRateLimitModule(options: RateLimitOptions = {}): HtxModule {
  const config = {
    windowMs: options.windowMs ?? 60000,
    max: options.max ?? 100,
    keyFn: options.keyFn ?? ((req: HtxRequest) => req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown"),
    message: options.message ?? "Too Many Requests",
  };

  const windows = new Map<string, number[]>();

  // Periodic cleanup every 60s
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of windows) {
      const filtered = timestamps.filter(t => now - t < config.windowMs);
      if (filtered.length === 0) windows.delete(key);
      else windows.set(key, filtered);
    }
  }, 60000).unref();

  return {
    name: () => "rate-limit",
    manifest: (): ModuleManifest => ({ trust: "first-party", middleware: ["rate-limit"] }),
    boot: (registry: ModuleRegistry) => {
      registry.registerMiddleware({
        name: () => "rate-limit",
        handle(request: HtxRequest, next: () => HtxResponse): HtxResponse {
          const key = config.keyFn(request);
          const now = Date.now();
          let timestamps = windows.get(key) || [];
          timestamps = timestamps.filter(t => now - t < config.windowMs);
          timestamps.push(now);
          windows.set(key, timestamps);

          const remaining = Math.max(0, config.max - timestamps.length);
          const resetAt = Math.ceil((timestamps[0] + config.windowMs) / 1000);

          if (timestamps.length > config.max) {
            const resp = HtxResp.json({ error: config.message }, 429);
            resp.headers["X-RateLimit-Limit"] = String(config.max);
            resp.headers["X-RateLimit-Remaining"] = "0";
            resp.headers["X-RateLimit-Reset"] = String(resetAt);
            resp.headers["Retry-After"] = String(Math.ceil(config.windowMs / 1000));
            return resp;
          }

          const resp = next();
          resp.headers["X-RateLimit-Limit"] = String(config.max);
          resp.headers["X-RateLimit-Remaining"] = String(remaining);
          resp.headers["X-RateLimit-Reset"] = String(resetAt);
          return resp;
        },
      });
    },
  };
}
