// Hypermedia App — Auth Module
// First-party HtxModule that registers auth middleware + context provider

import type { HtxModule, ModuleManifest, ModuleRegistry } from "../../../src/types";
import { AuthMiddleware } from "./middleware";
import { AuthContextProvider } from "./context-provider";
import { SqliteAdapter } from "../../../src/adapters/sqlite";

export class AuthModule implements HtxModule {
  constructor(
    private secret: string,
    private cookieName: string,
    private adapter: SqliteAdapter,
  ) {
    // Ensure user table exists
    adapter.exec(`CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  name(): string {
    return "auth";
  }

  manifest(): ModuleManifest {
    return {
      trust: "first-party",
      middleware: ["auth-session"],
      contextProviders: ["auth"],
    };
  }

  boot(registry: ModuleRegistry): void {
    registry.registerMiddleware(new AuthMiddleware(this.secret, this.cookieName));
    registry.registerContextProvider(new AuthContextProvider(this.secret, this.cookieName));
  }
}
