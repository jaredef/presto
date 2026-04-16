// Phase 8: Performance benchmarks
// Measures pipeline throughput for various page complexities

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrestoEngine } from "../../src/engine";
import { SqliteAdapter } from "../../src/adapters/sqlite";
import { join } from "node:path";
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import type { HtxRequest } from "../../src/types";

const TEMPLATES = join(import.meta.dir, "../../templates");
const PUBLIC = join(import.meta.dir, "../../public");
const DB_PATH = join(import.meta.dir, "bench-test.sqlite");
const SECRET = "bench-test-secret";
const TEST_DIR = join(TEMPLATES, "test-bench");

let adapter: SqliteAdapter;
let engine: PrestoEngine;

function req(path: string): HtxRequest {
  return { method: "GET", path, query: {}, headers: {}, cookies: {}, body: {}, bodyRaw: "", contentType: "", hxRequest: false, auth: null };
}

beforeAll(() => {
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  adapter = new SqliteAdapter(DB_PATH);
  adapter.exec("CREATE TABLE IF NOT EXISTS post (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, title TEXT, body TEXT, status TEXT)");
  for (let i = 1; i <= 100; i++) {
    adapter.exec(`INSERT INTO post (slug, title, body, status) VALUES ('post-${i}', 'Post ${i}', 'Body for post ${i}', 'published')`);
  }
  engine = new PrestoEngine({ templateDir: TEMPLATES, publicDir: PUBLIC, secret: SECRET, adapter });
  mkdirSync(TEST_DIR, { recursive: true });

  // Simple page (Layer 0 — no data, no components)
  writeFileSync(join(TEST_DIR, "simple.htx"), `<htx:layout none />
<h1>Simple Page</h1>
<p>No directives.</p>`);

  // Medium page (data + each + expressions)
  writeFileSync(join(TEST_DIR, "medium.htx"), `<htx:layout none />
<htx:data type="post" where="status = 'published'" order="id desc" limit="10" as="posts" />
<htx:let heading="Latest Posts" />
<h1><htx:v>heading</htx:v></h1>
<htx:each items="posts" as="post">
<div><h2><htx:v>post.title</htx:v></h2><p><htx:v>post.body</htx:v></p></div>
</htx:each>`);

  // Complex page (data + components + grants + actions + all directives)
  writeFileSync(join(TEST_DIR, "complex.htx"), `<htx:layout none />
<htx:data type="post" where="status = 'published'" order="id desc" limit="20" as="posts" />
<htx:let heading="Dashboard" />
<htx:grant type="websocket" as="ws" />
<htx:action name="delete" type="post" record="1" />

<h1><htx:v>heading</htx:v></h1>

<htx:component src="/ui/card.htx" title="Stats" description="Overview">
  <p>Total: <htx:v>posts | length</htx:v></p>
</htx:component>

<htx:each items="posts" as="post">
<htx:component src="/ui/card.htx" title="{htx:post.title}">
  <p><htx:v>post.body</htx:v></p>
  <htx:component src="/ui/badge.htx" variant="secondary"><htx:v>post.status | capitalize</htx:v></htx:component>
</htx:component>
</htx:each>

<htx:if test="posts">
<p>Posts loaded</p>
</htx:if>

<htx:auth><p>Admin view</p></htx:auth>
<htx:unauth><p>Public view</p></htx:unauth>

<htx:include src="/partials/nav.htx" />`);
});

afterAll(() => {
  adapter.close();
  for (const f of [DB_PATH, DB_PATH + "-wal", DB_PATH + "-shm"]) {
    if (existsSync(f)) unlinkSync(f);
  }
  if (existsSync(TEST_DIR)) require("node:fs").rmSync(TEST_DIR, { recursive: true });
});

describe("Performance Benchmarks", () => {
  const ITERATIONS = 100;

  test(`Simple page: ${ITERATIONS} iterations`, async () => {
    // Warmup
    await engine.handle(req("/test-bench/simple"));

    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await engine.handle(req("/test-bench/simple"));
    }
    const elapsed = performance.now() - start;
    const perReq = elapsed / ITERATIONS;
    const rps = Math.round(1000 / perReq);

    console.log(`  Simple: ${perReq.toFixed(2)}ms/req, ~${rps} req/s`);
    expect(perReq).toBeLessThan(10); // Should be well under 10ms
  });

  test(`Medium page (10 posts): ${ITERATIONS} iterations`, async () => {
    await engine.handle(req("/test-bench/medium"));

    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await engine.handle(req("/test-bench/medium"));
    }
    const elapsed = performance.now() - start;
    const perReq = elapsed / ITERATIONS;
    const rps = Math.round(1000 / perReq);

    console.log(`  Medium: ${perReq.toFixed(2)}ms/req, ~${rps} req/s`);
    expect(perReq).toBeLessThan(20);
  });

  test(`Complex page (20 posts + components + grants): ${ITERATIONS} iterations`, async () => {
    await engine.handle(req("/test-bench/complex"));

    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await engine.handle(req("/test-bench/complex"));
    }
    const elapsed = performance.now() - start;
    const perReq = elapsed / ITERATIONS;
    const rps = Math.round(1000 / perReq);

    console.log(`  Complex: ${perReq.toFixed(2)}ms/req, ~${rps} req/s`);
    expect(perReq).toBeLessThan(50);
  });

  test("Output correctness under load", async () => {
    // Verify the complex page still produces correct output after 100 iterations
    const resp = await engine.handle(req("/test-bench/complex"));
    expect(resp.body).toContain("Dashboard");
    expect(resp.body).toContain("Post 100"); // ordered by id desc, limit 20
    expect(resp.body).toContain("Post 81");
    expect(resp.body).toContain("ui-card");
    expect(resp.body).toContain("Published"); // badge content resolves as text (component inside each)
    expect(resp.body).toContain("Public view");
    expect(resp.body).toContain("Home | About | Blog");
    expect(resp.body).not.toMatch(/<htx:(data|each|component|v|if|auth|include)\b/);
  });
});
