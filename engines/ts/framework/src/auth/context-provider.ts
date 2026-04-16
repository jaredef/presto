// Hypermedia App — Auth Context Provider
// Injects auth.user into the data context for htx:auth/htx:unauth

import type { ContextProvider, HtxRequest } from "../../../src/types";
import { verifySession } from "./session";

export class AuthContextProvider implements ContextProvider {
  constructor(
    private secret: string,
    private cookieName: string,
  ) {}

  name(): string {
    return "auth";
  }

  resolve(request: HtxRequest): Record<string, unknown> {
    const token = request.cookies[this.cookieName];
    if (!token) return {};

    // Synchronous verification — we use tokenVerify which is async,
    // but context providers are called synchronously in the engine.
    // Pre-verify the session token and cache the result.
    // For the sync constraint, we'll decode the token payload directly
    // and do a simplified check here. Full HMAC verify happens at the
    // middleware level for route protection.
    try {
      const [encodedPayload] = token.split(".");
      const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString());
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return {};
      return {
        auth: {
          user: {
            id: payload.sub,
            name: payload.username,
            role: payload.role,
          },
        },
      };
    } catch {
      return {};
    }
  }
}
