// Bare engine — no modules loaded. For benchmarking module overhead.

import { PrestoEngine } from "../src/engine";
import { SqliteAdapter } from "../src/adapters/sqlite";
import { HtxResponse, type HtxRequest } from "../src/types";
import { join } from "node:path";

const PORT = 4031;
const ROOT = import.meta.dir;

const adapter = new SqliteAdapter(join(ROOT, "data/demo.db"));

const engine = new PrestoEngine({
  templateDir: join(ROOT, "pages"),
  publicDir: join(ROOT, "public"),
  secret: "bench-secret",
  adapter,
  modules: [], // NO MODULES
});

async function parseRequest(req: Request): Promise<HtxRequest> {
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });
  const cookies: Record<string, string> = {};
  for (const p of (req.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = p.trim().split("=");
    if (k) cookies[k.trim()] = v.join("=").trim();
  }
  return { method: "GET", path: url.pathname, query, headers, cookies, body: {}, bodyRaw: "", contentType: "", hxRequest: false, auth: null };
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const htxReq = await parseRequest(req);
    const resp = await engine.handle(htxReq);
    return new Response(resp.body, {
      status: resp.status,
      headers: { "Content-Type": resp.contentType, ...resp.headers },
    });
  },
});

console.log(`Bare engine (no modules) on port ${PORT}`);
