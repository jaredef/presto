// Module Kit — Health Check
// /healthz endpoint with uptime, memory, custom checks.

import type { HtxModule, ModuleManifest, ModuleRegistry, HtxRequest, HtxResponse } from "../src/types";
import { HtxResponse as HtxResp } from "../src/types";

export interface HealthCheck {
  name: string;
  check: () => { status: "ok" | "fail"; message?: string };
}

export interface HealthOptions {
  path?: string;
  checks?: HealthCheck[];
}

export function createHealthModule(options: HealthOptions = {}): HtxModule {
  const config = {
    path: options.path ?? "/healthz",
    checks: options.checks ?? [],
  };

  return {
    name: () => "health",
    manifest: (): ModuleManifest => ({ trust: "first-party", middleware: ["health"] }),
    boot: (registry: ModuleRegistry) => {
      registry.registerMiddleware({
        name: () => "health",
        handle(request: HtxRequest, next: () => HtxResponse): HtxResponse {
          if (request.path !== config.path) return next();

          const mem = process.memoryUsage();
          const checks = config.checks.map(c => {
            try {
              return { name: c.name, ...c.check() };
            } catch (err) {
              return { name: c.name, status: "fail" as const, message: String(err) };
            }
          });

          const allOk = checks.every(c => c.status === "ok");
          const status = checks.length === 0 ? "ok" : allOk ? "ok" : "degraded";

          return HtxResp.json({
            status,
            uptime: Math.floor(process.uptime()),
            memory: {
              rss: Math.round(mem.rss / 1024 / 1024),
              heap: Math.round(mem.heapUsed / 1024 / 1024),
            },
            checks,
          }, allOk || checks.length === 0 ? 200 : 503);
        },
      });
    },
  };
}
