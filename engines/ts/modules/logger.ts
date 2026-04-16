// Module Kit — Logger
// Logs method, path, status, response time. Configurable format and filtering.

import type { HtxModule, ModuleManifest, ModuleRegistry, Middleware, HtxRequest, HtxResponse } from "../src/types";

export interface LoggerOptions {
  colorize?: boolean;
  filter?: (path: string) => boolean;
}

export function createLoggerModule(options: LoggerOptions = {}): HtxModule {
  const config = {
    colorize: options.colorize ?? true,
    filter: options.filter ?? (() => true),
  };

  return {
    name: () => "logger",
    manifest: (): ModuleManifest => ({ trust: "first-party", middleware: ["logger"] }),
    boot: (registry: ModuleRegistry) => {
      registry.registerMiddleware({
        name: () => "logger",
        handle(request: HtxRequest, next: () => HtxResponse): HtxResponse {
          if (!config.filter(request.path)) return next();
          const start = performance.now();
          const resp = next();
          const elapsed = (performance.now() - start).toFixed(1);
          const s = resp.status;
          if (config.colorize) {
            const c = s < 300 ? "\x1b[32m" : s < 400 ? "\x1b[36m" : s < 500 ? "\x1b[33m" : "\x1b[31m";
            console.log(`  ${c}${request.method}\x1b[0m ${request.path} ${c}${s}\x1b[0m ${elapsed}ms`);
          } else {
            console.log(`  ${request.method} ${request.path} ${s} ${elapsed}ms`);
          }
          return resp;
        },
      });
    },
  };
}
