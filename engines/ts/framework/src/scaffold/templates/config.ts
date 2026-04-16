import type { ScaffoldOptions } from "../scaffold";

export function generateConfig(options: ScaffoldOptions): string {
  return `// ${options.name} — Configuration
// Every field maps to a directory convention. Edit to customize.

export default {
  name: "${options.name}",
  port: parseInt(process.env.PORT || "3000"),
  host: process.env.HOST || "0.0.0.0",
  secret: process.env.HTX_SECRET || "change-me-in-production",
  database: "app/data/app.db",
  templates: "app/pages",
  components: "app/components",
  public: "app/public",
  modules: [],
  auth: {
    enabled: ${options.auth},
    loginPage: "/login",
    sessionTtl: 86400,
    cookieName: "htx_session",
  },
  dev: {
    hotReload: true,
    errorPages: true,
    logging: true,
  },
};
`;
}
