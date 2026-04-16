// Module Kit — Auth
// Authentication module: HMAC sessions, password hashing, user table, context provider.
// Self-contained. Does not depend on the session module.

import type { HtxModule, ModuleManifest, ModuleRegistry, Middleware, ContextProvider, HtxRequest, HtxResponse, ContentAdapter } from "../src/types";
import { tokenSign, tokenVerify, base64urlDecode } from "../src/security/hmac";

export interface AuthOptions {
  secret: string;
  cookieName?: string;
  sessionTtl?: number;
  adapter?: ContentAdapter;
  userTable?: string;
  autoCreateTable?: boolean;
  setup?: (adapter: ContentAdapter) => void;
}

export function createAuthModule(options: AuthOptions): HtxModule {
  const config = {
    secret: options.secret,
    cookieName: options.cookieName ?? "htx_session",
    sessionTtl: options.sessionTtl ?? 86400,
    userTable: options.userTable ?? "user",
    autoCreateTable: options.autoCreateTable ?? true,
  };

  // Auto-create user table if adapter supports exec
  if (config.autoCreateTable && options.adapter) {
    const adapter = options.adapter as any;
    if (typeof adapter.exec === "function") {
      adapter.exec(`CREATE TABLE IF NOT EXISTS [${config.userTable}] (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
    }
  }

  if (options.setup && options.adapter) {
    options.setup(options.adapter);
  }

  return {
    name: () => "auth",
    manifest: (): ModuleManifest => ({
      trust: "first-party",
      middleware: ["auth-session"],
      contextProviders: ["auth"],
    }),
    boot: (registry: ModuleRegistry) => {
      // Middleware: reads session cookie, stashes decoded payload
      registry.registerMiddleware({
        name: () => "auth-session",
        handle(request: HtxRequest, next: () => HtxResponse): HtxResponse {
          const token = request.cookies[config.cookieName];
          if (token) {
            try {
              const [encoded] = token.split(".");
              const payload = JSON.parse(base64urlDecode(encoded));
              if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                // Expired
              } else {
                request.auth = {
                  user: {
                    id: payload.sub || payload.userId || "",
                    name: payload.username || "",
                    role: payload.role || "user",
                  },
                };
              }
            } catch {}
          }
          return next();
        },
      });

      // Context provider: injects auth into data context
      registry.registerContextProvider({
        name: () => "auth",
        resolve(request: HtxRequest): Record<string, unknown> {
          if (request.auth) {
            return { auth: request.auth };
          }
          return {};
        },
      });
    },
  };
}

// Exported utilities for route handlers

export async function createAuthSession(
  userId: string,
  username: string,
  role: string,
  secret: string,
  ttl: number = 86400,
): Promise<string> {
  return tokenSign({ sub: userId, username, role, exp: Math.floor(Date.now() / 1000) + ttl }, secret);
}

export async function verifyAuthSession(token: string, secret: string): Promise<{ userId: string; username: string; role: string } | null> {
  const payload = await tokenVerify(token, secret);
  if (!payload) return null;
  return { userId: payload.sub as string, username: payload.username as string, role: payload.role as string };
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}
