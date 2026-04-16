// PRESTO Builder — Editor Server
// Exercises the full module kit + builder module for the visual editor

import { PrestoEngine } from "../src/engine";
import { SqliteAdapter } from "../src/adapters/sqlite";
import { executePipeline } from "../src/pipeline";
import { chatComplete } from "../src/llm/claude";
import { assembleSystemPrompt, getSchema } from "../src/llm/context-assembler";
import { HtxResponse, type HtxRequest, type PipelineContext } from "../src/types";
import { EngineRegistry } from "../src/modules/registry";
import {
  createRequestIdModule,
  createLoggerModule,
  createCorsModule,
  createSecurityModule,
  createSessionModule,
  createAuthModule,
  createErrorHandlerModule,
  createHealthModule,
  createCacheModule,
} from "../modules/index";
import { createBuilderModule } from "../modules/builder";
import { join } from "node:path";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";

const PORT = parseInt(process.env.PORT || "4040");
const SECRET = "builder-secret-key";
const ROOT = import.meta.dir;
const TEMPLATES = join(ROOT, "pages");
const PUBLIC = join(ROOT, "public");
const DB = join(ROOT, "data/editor.db");

// Copy presto-ui assets
const prestoRoot = join(ROOT, "..");
for (const f of ["css/presto-ui.css", "js/presto-signals.js"]) {
  const src = join(prestoRoot, "public", f);
  const dest = join(PUBLIC, f);
  mkdirSync(join(dest, ".."), { recursive: true });
  if (existsSync(src)) copyFileSync(src, dest);
}
// Copy ui components into pages/ui for component resolution
const uiSrc = join(prestoRoot, "templates/ui");
const uiDest = join(TEMPLATES, "ui");
mkdirSync(uiDest, { recursive: true });
if (existsSync(uiSrc)) {
  for (const f of readdirSync(uiSrc)) copyFileSync(join(uiSrc, f), join(uiDest, f));
}

// Init adapter + create tables explicitly
const adapter = new SqliteAdapter(DB);
adapter.exec(`CREATE TABLE IF NOT EXISTS project (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, slug TEXT UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
adapter.exec(`CREATE TABLE IF NOT EXISTS page (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER, name TEXT, slug TEXT,
  htx_source TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

// Seed a demo project if empty
const projects = adapter.query({ type: "project", limit: 1 });
if (projects.length === 0) {
  adapter.exec("INSERT INTO project (name, slug) VALUES ('Demo Project', 'demo-project')");
  adapter.exec(`INSERT INTO page (project_id, name, slug, htx_source, status) VALUES (1, 'Home Page', 'home', '<h1>Welcome</h1>
<p>This page was created in the PRESTO Builder.</p>

<htx:component src="/ui/card.htx" title="Getting Started" description="Drag components from the palette">
  <p>Edit this card''s props in the property panel.</p>
</htx:component>
', 'draft')`);
  adapter.exec("INSERT INTO page (project_id, name, slug, htx_source, status) VALUES (1, 'About', 'about', '<h1>About</h1>\n<p>Built with the PRESTO visual editor.</p>', 'draft')");
  console.log("  Seeded demo project with 2 pages");
}

// Build the engine registry manually so we can pass it to the builder module
const engineRegistry = new EngineRegistry();

const engine = new PrestoEngine({
  templateDir: TEMPLATES,
  publicDir: PUBLIC,
  secret: SECRET,
  adapter,
  modules: [
    createErrorHandlerModule({ devMode: true }),
    createRequestIdModule(),
    createLoggerModule({ colorize: true }),
    createCorsModule({ origins: "*" }),
    createSecurityModule({ hsts: false }),
    createSessionModule({ secret: SECRET }),
    createAuthModule({ secret: SECRET, adapter }),
    createHealthModule(),
    createCacheModule({ etag: true }),
    createBuilderModule({
      adapter,
      templateRoot: TEMPLATES,
      publicRoot: PUBLIC,
      secret: SECRET,
      registry: engineRegistry,
    }),
  ],
});

// Assemble LLM system prompt at boot (static, cached)
const templateContextPath = join(ROOT, "../src/llm/template-context.md");
const componentRegistry = (() => {
  try {
    const regPath = join(ROOT, "../cli/registry.json");
    return JSON.parse(readFileSync(regPath, "utf-8")).components || {};
  } catch { return {}; }
})();
const dbSchema = getSchema(adapter);
const systemPrompt = assembleSystemPrompt(templateContextPath, componentRegistry, dbSchema);
console.log(`  LLM context: ${systemPrompt.length} chars (${Math.round(systemPrompt.length / 4)} tokens est.)`);
if (process.env.ANTHROPIC_API_KEY) console.log("  AI chat: enabled");
else console.log("  AI chat: disabled (set ANTHROPIC_API_KEY to enable)");

// Request parser
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

// Dedicated async preview endpoint (since channel handlers are sync)
async function handlePreview(body: Record<string, unknown>): Promise<Response> {
  const htxSource = (body.htxSource as string) || "";
  try {
    const ctx: PipelineContext = {
      request: { method: "GET", path: "/preview", query: {}, headers: {}, cookies: {}, body: {}, bodyRaw: "", contentType: "", hxRequest: false, auth: null },
      data: { __templateContent: htxSource },
      filePath: join(TEMPLATES, "__preview.htx"),
      templateRoot: TEMPLATES,
      publicRoot: PUBLIC,
      secret: SECRET,
      adapter,
      scriptCollector: [],
      registry: engineRegistry,
    };
    const html = await executePipeline(ctx);
    return Response.json({ html });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);

    // Dedicated preview endpoint (async)
    if (url.pathname === "/api/preview" && req.method === "POST") {
      const body = await req.json();
      return handlePreview(body);
    }

    // AI chat endpoint
    if (url.pathname === "/api/chat" && req.method === "POST") {
      const body = await req.json();
      const userMessage = (body.message as string) || "";
      const currentSource = (body.currentSource as string) || "";
      const history = (body.history as { role: string; content: string }[]) || [];

      // Build user message with current source context
      const contextMessage = currentSource
        ? `Current .htx template:\n\`\`\`htx\n${currentSource}\n\`\`\`\n\n${userMessage}`
        : userMessage;

      // Build messages array from history + current
      const llmMessages = [
        ...history.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: contextMessage },
      ];

      const response = await chatComplete({
        systemPrompt,
        messages: llmMessages,
      });

      return Response.json({
        text: response.text,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
      });
    }

    const htxReq = await parseRequest(req);
    const resp = await engine.handle(htxReq);
    return new Response(resp.body, {
      status: resp.status,
      headers: { "Content-Type": resp.contentType, ...resp.headers },
    });
  },
});

console.log(`\n  PRESTO Builder`);
console.log(`  http://0.0.0.0:${PORT}\n`);
