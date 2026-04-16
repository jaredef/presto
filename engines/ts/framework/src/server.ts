// Hypermedia App — Server Wrapper
// Thin layer: config → PrestoEngine → Bun.serve
// The developer can read this. The escape hatch is visible.

import { PrestoEngine } from "../../src/engine";
import { SqliteAdapter } from "../../src/adapters/sqlite";
import { HtxResponse, type HtxRequest } from "../../src/types";
import type { HypermediaAppConfig } from "./config";
import { resolve } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

export function createServer(config: HypermediaAppConfig) {
  const root = process.cwd();
  const templateDir = resolve(root, config.templates);
  const publicDir = resolve(root, config.public);
  const dbPath = resolve(root, config.database);
  const componentsDir = resolve(root, config.components);

  // Ensure directories exist
  for (const dir of [templateDir, publicDir, componentsDir]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const dbDir = resolve(dbPath, "..");
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

  // Create adapter
  const adapter = new SqliteAdapter(dbPath);

  // Collect modules
  const modules = [...config.modules];

  // Create engine
  const engine = new PrestoEngine({
    templateDir,
    publicDir,
    secret: config.secret,
    adapter,
    modules,
  });

  // Start server
  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    async fetch(req) {
      const htxReq = await parseRequest(req);
      const resp = await engine.handle(htxReq);

      return new Response(resp.body, {
        status: resp.status,
        headers: {
          "Content-Type": resp.contentType,
          "X-Powered-By": "Hypermedia App",
          ...resp.headers,
        },
      });
    },
  });

  console.log(`\n  Hypermedia App — ${config.name}`);
  console.log(`  http://${config.host}:${config.port}\n`);
  console.log(`  Templates:  ${config.templates}`);
  console.log(`  Components: ${config.components}`);
  console.log(`  Public:     ${config.public}`);
  console.log(`  Database:   ${config.database}`);
  console.log(`  Auth:       ${config.auth.enabled ? "enabled" : "disabled"}\n`);

  return { server, engine, adapter };
}

async function parseRequest(req: Request): Promise<HtxRequest> {
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  let body: Record<string, unknown> = {};
  let bodyRaw = "";

  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    bodyRaw = await req.text();
    const ct = req.headers.get("content-type") || "";

    if (ct.includes("application/json")) {
      try { body = JSON.parse(bodyRaw); } catch {}
    } else if (ct.includes("application/x-www-form-urlencoded")) {
      for (const pair of bodyRaw.split("&")) {
        const [k, ...v] = pair.split("=");
        if (k) {
          body[decodeURIComponent(k.replace(/\+/g, " "))] = decodeURIComponent(v.join("=").replace(/\+/g, " "));
        }
      }
    }
  }

  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });

  const cookies: Record<string, string> = {};
  const cookieHeader = req.headers.get("cookie") || "";
  for (const pair of cookieHeader.split(";")) {
    const [k, ...v] = pair.trim().split("=");
    if (k) cookies[k.trim()] = v.join("=").trim();
  }

  return {
    method: req.method,
    path: url.pathname,
    query,
    headers,
    cookies,
    body,
    bodyRaw,
    contentType: req.headers.get("content-type") || "",
    hxRequest: req.headers.has("hx-request"),
    auth: null,
  };
}
