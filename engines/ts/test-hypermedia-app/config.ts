// test-hypermedia-app — Configuration
// Every field maps to a directory convention. Edit to customize.

export default {
  name: "test-hypermedia-app",
  port: parseInt(process.env.PORT || "3000"),
  host: process.env.HOST || "0.0.0.0",
  secret: process.env.HTX_SECRET || "change-me-in-production",
  database: "app/data/app.db",
  templates: "app/pages",
  components: "app/components",
  public: "app/public",
  modules: [],
  auth: {
    enabled: true,
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
