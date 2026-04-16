// Demo app — exercises all 12 Module Kit modules + presto-ui components
// Load .env from demo directory
import { readFileSync, existsSync } from "node:fs";
const envPath = import.meta.dir + "/.env";
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const [key, ...val] = line.split("=");
    if (key && val.length) process.env[key.trim()] = val.join("=").trim();
  }
}

import { PrestoEngine } from "../src/engine";
import { SqliteAdapter } from "../src/adapters/sqlite";
import { executePipeline } from "../src/pipeline";
import { HtxResponse, type HtxRequest, type PipelineContext } from "../src/types";
import { chatComplete } from "../src/llm/claude";
import { assembleSystemPrompt, getSchema } from "../src/llm/context-assembler";
import { readFileSync } from "node:fs";
import {
  createRequestIdModule,
  createLoggerModule,
  createCorsModule,
  createSecurityModule,
  createSessionModule,
  createRateLimitModule,
  createCacheModule,
  createAuthModule,
  createErrorHandlerModule,
  createHealthModule,
  createStaticAssetsModule,
} from "../modules/index";
import { tokenVerify } from "../src/security/hmac";
import { createIslandModule } from "../modules/islands";
import { createStyleGuideModule } from "../modules/style-guide";
import { createBuilderModule } from "../modules/builder";
import { EngineRegistry } from "../src/modules/registry";
import { join } from "node:path";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const PORT = parseInt(process.env.PORT || "4030");
const SECRET = "demo-app-secret-key";
const ROOT = import.meta.dir;

// Copy presto-ui assets into demo public
const prestoRoot = join(ROOT, "..");
for (const f of ["css/presto-ui.css", "js/presto-signals.js"]) {
  const src = join(prestoRoot, "public", f);
  const dest = join(ROOT, "public", f);
  mkdirSync(join(dest, ".."), { recursive: true });
  if (existsSync(src)) copyFileSync(src, dest);
}

// Copy ui components into demo pages
const uiSrc = join(prestoRoot, "templates/ui");
const uiDest = join(ROOT, "pages/ui");
mkdirSync(uiDest, { recursive: true });
if (existsSync(uiSrc)) {
  for (const f of require("fs").readdirSync(uiSrc)) {
    copyFileSync(join(uiSrc, f), join(uiDest, f));
  }
}

// Init adapter + seed
const adapter = new SqliteAdapter(join(ROOT, "data/demo.db"));
adapter.exec(`CREATE TABLE IF NOT EXISTS post (
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, title TEXT, body TEXT, status TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
adapter.exec(`CREATE TABLE IF NOT EXISTS user (
  id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT DEFAULT 'user',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

// Additional tables for cookbook + editor
adapter.exec(`CREATE TABLE IF NOT EXISTS task (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT,
  status TEXT DEFAULT 'todo', priority TEXT DEFAULT 'medium',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
adapter.exec(`CREATE TABLE IF NOT EXISTS project (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, slug TEXT UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
adapter.exec(`CREATE TABLE IF NOT EXISTS page (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, name TEXT, slug TEXT,
  htx_source TEXT DEFAULT '', status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

const existingPosts = adapter.query({ type: "post", limit: 1 });
if (existingPosts.length === 0) {
  // Posts for CRUD + pagination demos
  const posts = [
    ["hello-world", "Hello World", "This is the first post, served by the PRESTO Module Kit demo.", "published"],
    ["module-kit", "The Module Kit", "Twelve pre-built modules for the server side of the bilateral boundary.", "published"],
    ["progressive-escape", "Progressive Escape", "Every library component can be replaced with raw directives.", "published"],
    ["surface-by-default", "Surface by Default", "Layer 0 is the position of maximum properties. Depth is cost.", "published"],
    ["home-depth", "Home Depth", "The depth whose constraint-to-property ratio matches your problems.", "published"],
    ["bilateral-boundary", "The Bilateral Boundary", "The developer writes for two interpreters. One erases its instructions.", "published"],
    ["architectural-encapsulation", "Architectural Encapsulation", "REST encloses any client-side architecture. Nesting direction matters.", "published"],
    ["constraint-inversion", "The Constraint Inversion", "React's constraints are more restrictive than REST's, not less.", "published"],
    ["seven-engines", "Seven Engines", "Six languages, one specification. The engine is bounded.", "published"],
    ["compensation-stack", "The Compensation Stack", "Each step compensates for the problem the previous step introduced.", "published"],
    ["draft-ideas", "Draft Ideas", "Some thoughts not yet ready for publication.", "draft"],
    ["unpublished-notes", "Unpublished Notes", "Internal working notes.", "draft"],
  ];
  for (const [slug, title, body, status] of posts) {
    adapter.create("post", { slug, title, body, status });
  }

  // Tasks for kanban demo
  const tasks = [
    ["Design homepage", "Create the landing page layout", "done", "high"],
    ["Build nav component", "Responsive navigation bar", "done", "medium"],
    ["Set up database", "SQLite with WAL mode", "done", "high"],
    ["Write auth module", "HMAC sessions, password hashing", "in-progress", "high"],
    ["Add search", "Live search with debounce", "in-progress", "medium"],
    ["Create form validation", "Client-side validation layer", "todo", "medium"],
    ["Build notification feed", "Real-time via WebSocket", "todo", "low"],
    ["Write documentation", "API reference and guides", "todo", "medium"],
    ["Performance benchmarks", "Throughput and latency testing", "todo", "low"],
  ];
  for (const [title, desc, status, priority] of tasks) {
    adapter.create("task", { title, description: desc, status, priority });
  }

  // Editor projects + pages
  adapter.create("project", { name: "My Website", slug: "my-website" });
  adapter.create("project", { name: "Blog", slug: "blog" });
  adapter.create("page", {
    project_id: 1, name: "Home Page", slug: "home", status: "draft",
    htx_source: '<h1>Welcome to My Website</h1>\n<p>This page was created in the PRESTO Builder.</p>\n\n<htx:component src="/ui/card.htx" title="Getting Started" description="Drag components or ask the AI">\n  <p>Use the palette on the left to drag components, or type in the chat below to describe what you want.</p>\n</htx:component>\n',
  });
  adapter.create("page", {
    project_id: 1, name: "About", slug: "about", status: "draft",
    htx_source: '<h1>About</h1>\n<p>Tell your visitors about yourself.</p>\n',
  });
  adapter.create("page", {
    project_id: 1, name: "Contact", slug: "contact", status: "draft",
    htx_source: '<h1>Contact</h1>\n<htx:component src="/ui/form.htx" action="create" type="message">\n  <htx:component src="/ui/input.htx" label="Name" name="name" required="required" />\n  <htx:component src="/ui/input.htx" label="Email" type="email" name="email" required="required" />\n  <htx:component src="/ui/textarea.htx" label="Message" name="body" rows="5" />\n</htx:component>\n',
  });
  adapter.create("page", {
    project_id: 2, name: "Blog Home", slug: "index", status: "draft",
    htx_source: '<htx:data type="post" where="status = \'published\'" order="id desc" limit="10" as="posts" />\n<h1>Blog</h1>\n<htx:each items="posts" as="post">\n<htx:component src="/ui/card.htx" title="{htx:post.title}">\n  <p><htx:v>post.body</htx:v></p>\n</htx:component>\n<htx:empty />\n<p>No posts yet.</p>\n</htx:each>\n',
  });

  console.log("  Seeded 12 posts + 9 tasks + 2 projects + 4 pages");
}

// Build engine with ALL 12 modules (minus flash — needs session cookie set first)
const engine = new PrestoEngine({
  templateDir: join(ROOT, "pages"),
  publicDir: join(ROOT, "public"),
  secret: SECRET,
  adapter,
  modules: [
    createErrorHandlerModule({ devMode: true }),
    createRequestIdModule(),
    createLoggerModule({ colorize: true, filter: (p) => !p.startsWith("/healthz") }),
    createCorsModule({ origins: "*", credentials: false }),
    createSecurityModule({ hsts: false }), // no HSTS for local dev
    createRateLimitModule({ max: 50000, windowMs: 60000, keyFn: () => "demo" }),
    createCacheModule({ etag: true, defaultTtl: 0 }),
    createSessionModule({ secret: SECRET }),
    createAuthModule({ secret: SECRET, adapter }),
    createHealthModule({
      checks: [
        { name: "database", check: () => { adapter.query({ type: "post", limit: 1 }); return { status: "ok" }; } },
      ],
    }),
    createStaticAssetsModule({ publicDir: join(ROOT, "public") }),
    createBuilderModule({
      adapter,
      templateRoot: join(ROOT, "pages"),
      publicRoot: join(ROOT, "public"),
      secret: SECRET,
      registry: new EngineRegistry(),
    }),
    createIslandModule({
      bundleDir: join(ROOT, "public/js/islands"),
    }),
    createStyleGuideModule({
      path: join(ROOT, "styles.json"),
      watchForChanges: true,
    }),
  ],
});

// Assemble LLM system prompt at boot
const templateContextPath = join(ROOT, "../src/llm/template-context.md");
const componentRegistry = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, "../cli/registry.json"), "utf-8")).components || {}; }
  catch { return {}; }
})();
const dbSchema = getSchema(adapter);
const { getStyles: loadStyleGuide } = await import("../modules/style-guide");
const styleGuideTokens = loadStyleGuide(join(ROOT, "styles.json"));
const systemPrompt = assembleSystemPrompt(templateContextPath, componentRegistry, dbSchema, styleGuideTokens);
console.log(`  LLM context: ${systemPrompt.length} chars (~${Math.round(systemPrompt.length / 4)} tokens)`);
if (process.env.ANTHROPIC_API_KEY) console.log("  AI chat: enabled");
else console.log("  AI chat: disabled (set ANTHROPIC_API_KEY)");

// Session verification for editor API endpoints
// Development mode: if EDITOR_AUTH is not set, allow unauthenticated access
const requireEditorAuth = process.env.EDITOR_AUTH === "true";
if (requireEditorAuth) console.log("  Editor auth: required (EDITOR_AUTH=true)");
else console.log("  Editor auth: development mode (set EDITOR_AUTH=true to require login)");

async function verifyEditorRequest(req: Request): Promise<{ userId: string; username: string; role: string } | null> {
  // Development mode bypass
  if (!requireEditorAuth) return { userId: "dev", username: "developer", role: "admin" };

  // Read htx_session cookie
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/htx_session=([^;\s]+)/);
  if (!match) return null;

  // Verify HMAC signature + expiry
  const payload = await tokenVerify(match[1], SECRET);
  if (!payload) return null;

  return {
    userId: (payload.sub as string) || "",
    username: (payload.username as string) || "",
    role: (payload.role as string) || "user",
  };
}

// Parse request
async function parseRequest(req: Request): Promise<HtxRequest> {
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });
  let body: Record<string, unknown> = {};
  let bodyRaw = "";
  if (req.method === "POST") {
    bodyRaw = await req.text();
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("json")) try { body = JSON.parse(bodyRaw); } catch {}
    else if (ct.includes("urlencoded")) {
      for (const p of bodyRaw.split("&")) {
        const [k, ...v] = p.split("=");
        if (k) body[decodeURIComponent(k.replace(/\+/g, " "))] = decodeURIComponent(v.join("=").replace(/\+/g, " "));
      }
    }
  }
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });
  const cookies: Record<string, string> = {};
  for (const p of (req.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = p.trim().split("=");
    if (k) cookies[k.trim()] = v.join("=").trim();
  }
  return { method: req.method, path: url.pathname, query, headers, cookies, body, bodyRaw, contentType: req.headers.get("content-type") || "", hxRequest: req.headers.has("hx-request"), auth: null };
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);

    // --- Editor API endpoints (session-verified) ---

    // AI chat endpoint
    if (url.pathname === "/api/chat" && req.method === "POST") {
      const user = await verifyEditorRequest(req);
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const body = await req.json();
      const userMessage = (body.message as string) || "";
      const currentSource = (body.currentSource as string) || "";
      const history = (body.history as any[]) || [];
      const contextMessage = currentSource
        ? `Current .htx template:\n\`\`\`htx\n${currentSource}\n\`\`\`\n\n${userMessage}`
        : userMessage;
      const llmMessages = [
        ...history.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: contextMessage },
      ];
      const response = await chatComplete({ systemPrompt, messages: llmMessages });
      return Response.json({ text: response.text, inputTokens: response.inputTokens, outputTokens: response.outputTokens });
    }

    // Save endpoint
    if (url.pathname === "/api/save" && req.method === "POST") {
      const user = await verifyEditorRequest(req);
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const body = await req.json();
      const pageId = body.pageId as number;
      const htxSource = body.htxSource as string;
      if (!pageId || htxSource === undefined) {
        return Response.json({ error: "pageId and htxSource required" }, { status: 400 });
      }
      const success = adapter.update("page", pageId, {
        htx_source: htxSource,
        updated_at: new Date().toISOString(),
      });
      return Response.json({ success });
    }

    // Load endpoint
    if (url.pathname === "/api/load" && req.method === "GET") {
      const user = await verifyEditorRequest(req);
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const pageId = new URL(req.url).searchParams.get("pageId");
      if (!pageId) return Response.json({ error: "pageId required" }, { status: 400 });
      const page = adapter.get("page", pageId);
      if (!page) return Response.json({ error: "Page not found" }, { status: 404 });
      return Response.json({
        id: page.id, name: page.name, slug: page.slug,
        htxSource: page.htx_source, status: page.status,
      });
    }

    // Save custom component
    if (url.pathname === "/api/save-component" && req.method === "POST") {
      const user = await verifyEditorRequest(req);
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const body = await req.json();
      const name = (body.name as string || "").replace(/[^a-z0-9-]/g, "");
      const source = body.source as string || "";
      if (!name || !source) return Response.json({ error: "name and source required" }, { status: 400 });

      const { writeFileSync, mkdirSync } = await import("node:fs");
      const compDir = join(ROOT, "pages/components");
      mkdirSync(compDir, { recursive: true });
      writeFileSync(join(compDir, name + ".htx"), source);
      return Response.json({ success: true, path: "/components/" + name + ".htx", description: name });
    }

    // List custom components
    if (url.pathname === "/api/custom-components" && req.method === "GET") {
      const { readdirSync, existsSync: ex } = await import("node:fs");
      const compDir = join(ROOT, "pages/components");
      if (!ex(compDir)) return Response.json([]);
      const files = readdirSync(compDir).filter((f: string) => f.endsWith(".htx"));
      return Response.json(files.map((f: string) => ({ name: f.replace(".htx", ""), file: f })));
    }

    // Style guide endpoint — read and update style tokens
    if (url.pathname === "/api/styles") {
      const user = await verifyEditorRequest(req);
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const stylePath = join(ROOT, "styles.json");
      if (req.method === "GET") {
        const { getStyles } = await import("../modules/style-guide");
        return Response.json(getStyles(stylePath));
      }
      if (req.method === "POST") {
        const body = await req.json();
        const { saveStyles } = await import("../modules/style-guide");
        saveStyles(stylePath, body as Record<string, string>);
        return Response.json({ success: true });
      }
    }

    // Preview endpoint (resolve .htx source through pipeline)
    if (url.pathname === "/api/preview" && req.method === "POST") {
      const user = await verifyEditorRequest(req);
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const body = await req.json();
      const htxSource = (body.htxSource as string) || "";
      try {
        const ctx: PipelineContext = {
          request: { method: "GET", path: "/preview", query: {}, headers: {}, cookies: {}, body: {}, bodyRaw: "", contentType: "", hxRequest: false, auth: null },
          data: { __templateContent: htxSource, styles: styleGuideTokens },
          filePath: join(ROOT, "pages/__preview.htx"),
          templateRoot: join(ROOT, "pages"),
          publicRoot: join(ROOT, "public"),
          secret: SECRET,
          adapter,
          scriptCollector: [],
          registry: new EngineRegistry(),
        };
        const html = await executePipeline(ctx);
        return Response.json({ html });
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 });
      }
    }

    const htxReq = await parseRequest(req);
    const resp = await engine.handle(htxReq);
    return new Response(resp.body, {
      status: resp.status,
      headers: { "Content-Type": resp.contentType, ...resp.headers },
    });
  },
});

console.log(`\n  PRESTO Module Kit Demo`);
console.log(`  http://0.0.0.0:${PORT}`);
console.log(`  12 modules loaded\n`);
