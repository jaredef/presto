// Module Kit — Error Handler
// Custom error pages. Dev mode stack traces. 404/500 template support.

import type { HtxModule, ModuleManifest, ModuleRegistry, HtxRequest, HtxResponse } from "../src/types";
import { HtxResponse as HtxResp } from "../src/types";

export interface ErrorHandlerOptions {
  devMode?: boolean;
}

export function createErrorHandlerModule(options: ErrorHandlerOptions = {}): HtxModule {
  const devMode = options.devMode ?? (process.env.NODE_ENV !== "production");

  return {
    name: () => "error-handler",
    manifest: (): ModuleManifest => ({ trust: "first-party", middleware: ["error-handler"] }),
    boot: (registry: ModuleRegistry) => {
      registry.registerMiddleware({
        name: () => "error-handler",
        handle(request: HtxRequest, next: () => HtxResponse): HtxResponse {
          try {
            return next();
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error(`Pipeline error: ${error.message}`);
            if (devMode) {
              return HtxResp.html(renderDevError(error, request.path), 500);
            }
            return HtxResp.html("<h1>500 — Internal Server Error</h1>", 500);
          }
        },
      });
    },
  };
}

function renderDevError(error: Error, path: string): string {
  const stack = (error.stack || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const message = (error.message || "Unknown error").replace(/</g, "&lt;");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title>
<style>body{font-family:system-ui;margin:0;padding:2rem;background:#1a1a2e;color:#eee}
.e{max-width:800px;margin:0 auto}h1{color:#ef4444;font-size:1.5rem}
.path{color:#888;font-size:0.9rem;margin-bottom:1.5rem}
.msg{background:#2a2a3e;padding:1rem;border-radius:8px;border-left:3px solid #ef4444;margin-bottom:1.5rem}
.stack{background:#111;padding:1rem;border-radius:8px;font-family:monospace;font-size:0.8rem;white-space:pre-wrap;color:#aaa;overflow-x:auto}</style>
</head><body><div class="e"><h1>Pipeline Error</h1><div class="path">${path}</div>
<div class="msg">${message}</div><div class="stack">${stack}</div></div></body></html>`;
}
