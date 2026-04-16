// Hypermedia App — Configuration
// Every field maps to a project convention. The config teaches the structure.

import type { HtxModule } from "../../src/types";

export interface HypermediaAppConfig {
  name: string;
  port: number;
  host: string;
  secret: string;
  database: string;
  templates: string;
  components: string;
  public: string;
  modules: HtxModule[];
  auth: {
    enabled: boolean;
    loginPage: string;
    sessionTtl: number;
    cookieName: string;
  };
  dev: {
    hotReload: boolean;
    errorPages: boolean;
    logging: boolean;
  };
}

export function defaultConfig(overrides: Partial<HypermediaAppConfig> = {}): HypermediaAppConfig {
  return {
    name: "my-app",
    port: 3000,
    host: "0.0.0.0",
    secret: process.env.HTX_SECRET || "change-me-in-production",
    database: "app/data/app.db",
    templates: "app/pages",
    components: "app/components",
    public: "app/public",
    modules: [],
    auth: {
      enabled: false,
      loginPage: "/login",
      sessionTtl: 86400,
      cookieName: "htx_session",
      ...overrides.auth,
    },
    dev: {
      hotReload: true,
      errorPages: true,
      logging: true,
      ...overrides.dev,
    },
    ...overrides,
    // Re-apply nested overrides (spread above clobbers them)
    auth: { enabled: false, loginPage: "/login", sessionTtl: 86400, cookieName: "htx_session", ...overrides.auth },
    dev: { hotReload: true, errorPages: true, logging: true, ...overrides.dev },
  };
}
