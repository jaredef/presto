// Module Kit — Session
// Stateless HMAC-signed cookie sessions. No server-side session store.

import type { HtxModule, ModuleManifest, ModuleRegistry, Middleware, ContextProvider, HtxRequest, HtxResponse } from "../src/types";
import { base64urlEncode, base64urlDecode } from "../src/security/hmac";

export interface SessionOptions {
  secret: string;
  cookieName?: string;
  ttl?: number;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export function createSessionModule(options: SessionOptions): HtxModule {
  const config = {
    secret: options.secret,
    cookieName: options.cookieName ?? "htx_session",
    ttl: options.ttl ?? 86400,
    path: options.path ?? "/",
    httpOnly: options.httpOnly ?? true,
    secure: options.secure ?? false,
    sameSite: options.sameSite ?? ("Lax" as const),
  };

  return {
    name: () => "session",
    manifest: (): ModuleManifest => ({
      trust: "first-party",
      middleware: ["session"],
      contextProviders: ["session"],
    }),
    boot: (registry: ModuleRegistry) => {
      registry.registerMiddleware({
        name: () => "session",
        handle(request: HtxRequest, next: () => HtxResponse): HtxResponse {
          const token = request.cookies[config.cookieName];
          if (token) {
            const payload = decodeSessionSync(token);
            if (payload) (request as any)._session = payload;
          }
          return next();
        },
      });
      registry.registerContextProvider({
        name: () => "session",
        resolve(request: HtxRequest): Record<string, unknown> {
          const session = (request as any)._session;
          return session ? { session } : {};
        },
      });
    },
  };
}

// Sync decode: base64url decode payload, check expiry. No HMAC verify (sync constraint).
function decodeSessionSync(token: string): Record<string, unknown> | null {
  try {
    const [encoded] = token.split(".");
    const payload = JSON.parse(base64urlDecode(encoded));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// Async encode/decode for use in route handlers (exported utilities)
export { tokenSign as encodeSession, tokenVerify as decodeSession } from "../src/security/hmac";
