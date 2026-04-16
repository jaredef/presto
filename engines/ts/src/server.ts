// PRESTO-TS v3 — Bun.serve HTTP Server

import { PrestoEngine } from "./engine";
import { SqliteAdapter } from "./adapters/sqlite";
import { HtxResponse, type HtxRequest } from "./types";
import { join } from "node:path";

const PORT = parseInt(process.env.HTX_PORT || "4010");
const HOST = process.env.HTX_HOST || "0.0.0.0";
const DB_PATH = process.env.HTX_DB || "presto.db";
const SECRET = process.env.HTX_SECRET || "presto-ts-v3-change-in-production";
const TEMPLATE_DIR = join(import.meta.dir, "../templates");
const PUBLIC_DIR = join(import.meta.dir, "../public");

// Init adapter + seed demo data
const adapter = new SqliteAdapter(DB_PATH);
adapter.exec(`CREATE TABLE IF NOT EXISTS post (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT, title TEXT, body TEXT, status TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

// Seed if empty
const existing = adapter.query({ type: "post", limit: 1 });
if (existing.length === 0) {
  adapter.exec("INSERT INTO post (slug, title, body, status) VALUES ('getting-started', 'Getting Started with PRESTO', 'PRESTO is a progressive representational state transfer architecture. This engine resolves htx: directives into pure HTML.', 'published')");
  adapter.exec("INSERT INTO post (slug, title, body, status) VALUES ('components', 'Component Library', 'presto-ui provides 34 components across Layers 0, 2, and 3-4. All are .htx files that resolve through the 22-stage pipeline.', 'published')");
  adapter.exec("INSERT INTO post (slug, title, body, status) VALUES ('signals', 'Signal Reactivity', 'The signal system provides surgical DOM updates without a virtual DOM. signal(), computed(), effect(), bind() — ~3KB total.', 'published')");
  adapter.exec("INSERT INTO post (slug, title, body, status) VALUES ('architecture', 'Architectural Style', 'PRESTO formalizes code-on-demand as a progressive spectrum. 7 conformant engines across 7 languages prove the specification is complete.', 'published')");
  adapter.exec("INSERT INTO post (slug, title, body, status) VALUES ('draft-post', 'Draft Post', 'This post is not published.', 'draft')");
  console.log("  Seeded 5 posts (4 published, 1 draft)");
}

// Init engine
const engine = new PrestoEngine({
  templateDir: TEMPLATE_DIR,
  publicDir: PUBLIC_DIR,
  secret: SECRET,
  adapter,
});

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const pair of header.split(";")) {
    const [k, ...v] = pair.trim().split("=");
    if (k) cookies[k.trim()] = v.join("=").trim();
  }
  return cookies;
}

function parseQuery(url: URL): Record<string, string> {
  const q: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { q[k] = v; });
  return q;
}

async function parseBody(req: Request): Promise<{ body: Record<string, unknown>; raw: string }> {
  const ct = req.headers.get("content-type") || "";
  const raw = await req.text();

  if (ct.includes("application/json")) {
    try { return { body: JSON.parse(raw), raw }; } catch { return { body: {}, raw }; }
  }

  if (ct.includes("application/x-www-form-urlencoded")) {
    const body: Record<string, unknown> = {};
    for (const pair of raw.split("&")) {
      const [k, ...v] = pair.split("=");
      if (k) {
        const key = decodeURIComponent(k.replace(/\+/g, " "));
        const val = decodeURIComponent(v.join("=").replace(/\+/g, " "));
        body[key] = val;
      }
    }
    return { body, raw };
  }

  return { body: {}, raw };
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req) {
    const url = new URL(req.url);
    const { body, raw } = req.method === "POST" ? await parseBody(req) : { body: {}, raw: "" };

    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => { headers[k] = v; });

    const htxReq: HtxRequest = {
      method: req.method,
      path: url.pathname,
      query: parseQuery(url),
      headers,
      cookies: parseCookies(req.headers.get("cookie") || ""),
      body,
      bodyRaw: raw,
      contentType: req.headers.get("content-type") || "",
      hxRequest: req.headers.has("hx-request"),
      auth: null,
    };

    const resp = await engine.handle(htxReq);

    const responseHeaders: Record<string, string> = {
      "Content-Type": resp.contentType,
      "X-Powered-By": "PRESTO/TS v3",
      ...resp.headers,
    };

    return new Response(resp.body, {
      status: resp.status,
      headers: responseHeaders,
    });
  },
});

console.log(`PRESTO/TS v3 — htxlang engine`);
console.log(`  Port:      ${PORT}`);
console.log(`  Host:      ${HOST}`);
console.log(`  Templates: ${TEMPLATE_DIR}`);
console.log(`  Public:    ${PUBLIC_DIR}`);
console.log(`  Database:  ${DB_PATH}`);
console.log(`  Server:    http://${HOST}:${PORT}`);
console.log(`  Press Ctrl+C to stop.\n`);
