// Module Kit — Flash Messages
// Session-based one-time messages. Set on redirect, consumed on next read.

import type { HtxModule, ModuleManifest, ModuleRegistry, Middleware, ContextProvider, HtxRequest, HtxResponse } from "../src/types";

export interface FlashOptions {
  sessionKey?: string;
}

export function createFlashModule(options: FlashOptions = {}): HtxModule {
  const sessionKey = options.sessionKey ?? "flash";

  return {
    name: () => "flash",
    manifest: (): ModuleManifest => ({
      trust: "first-party",
      middleware: ["flash"],
      contextProviders: ["flash"],
    }),
    boot: (registry: ModuleRegistry) => {
      registry.registerMiddleware({
        name: () => "flash",
        handle(request: HtxRequest, next: () => HtxResponse): HtxResponse {
          // Read flash from session data (populated by session middleware)
          const session = (request as any)._session;
          if (session && session[sessionKey]) {
            (request as any)._flash = session[sessionKey];
          }
          return next();
        },
      });
      registry.registerContextProvider({
        name: () => "flash",
        resolve(request: HtxRequest): Record<string, unknown> {
          const flash = (request as any)._flash;
          return flash ? { flash } : {};
        },
      });
    },
  };
}
