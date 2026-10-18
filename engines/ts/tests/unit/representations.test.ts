// F4 fragments, F5 required data and _404.htx, F6 underscore paths not routable,
// and Vary on template responses (.plans/htxlang-closure-plan.md, K6 and K7).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrestoEngine } from "../../src/engine";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import type { ContentAdapter, HtxRequest } from "../../src/types";

let ROOT: string;
let engine: PrestoEngine;
let bare: PrestoEngine;

const posts = [{ id: 1, slug: "hello", title: "Hello" }];
const adapter: ContentAdapter = {
  query: () => posts,
  get: (_t, id) => posts.find((p) => p.slug === id) ?? null,
  create: () => { throw new Error("read-only"); },
  update: () => false,
  delete: () => false,
};

function get(path: string, headers: Record<string, string> = {}, query: Record<string, string> = {}): HtxRequest {
  return { method: "GET", path, query, headers, cookies: {}, body: {}, bodyRaw: "", contentType: "", hxRequest: "hx-request" in headers, auth: null };
}

const page = (r: { body: string | Uint8Array }) => String(r.body);

beforeAll(() => {
  ROOT = mkdtempSync(join(tmpdir(), "presto-repr-"));
  const t = join(ROOT, "templates");
  mkdirSync(join(t, "posts"), { recursive: true });
  mkdirSync(join(t, "_partials"));
  mkdirSync(join(ROOT, "public"));
  writeFileSync(join(t, "_layout.htx"), "<!DOCTYPE html><html><body><nav>site</nav>__content__</body></html>");
  writeFileSync(join(t, "_partials", "nav.htx"), "<p>partial</p>");
  writeFileSync(join(t, "_404.htx"), "<h1>Gone: <htx:v>request.path</htx:v></h1>");
  writeFileSync(join(t, "uses-partial.htx"), "<htx:include src=\"/_partials/nav.htx\"/>");
  writeFileSync(join(t, "browse.htx"),
    "<h1>Browse</h1><htx:fragment name=\"list\"><div id=\"list\"><htx:v>query.q</htx:v>" +
    "<htx:fragment name=\"inner\"><b>in</b></htx:fragment></div></htx:fragment><footer>end</footer>");
  writeFileSync(join(t, "posts", "[slug].htx"), "<htx:data type=\"post\" where=\"slug = '{htx:params.slug}'\" as=\"post\" required/><h1><htx:v>post.0.title</htx:v></h1>");
  engine = new PrestoEngine({ templateDir: t, publicDir: join(ROOT, "public"), secret: "repr-test-secret", adapter });

  const t2 = join(ROOT, "bare");
  mkdirSync(t2);
  writeFileSync(join(t2, "x.htx"), "<htx:data type=\"post\" where=\"slug = 'none'\" as=\"p\" required/>");
  bare = new PrestoEngine({ templateDir: t2, publicDir: join(ROOT, "public"), secret: "repr-test-secret", adapter: { ...adapter, get: () => null } });
});

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe("F4 fragments", () => {
  test("an htmx request naming a fragment gets exactly that region of the full page", async () => {
    const full = page(await engine.handle(get("/browse", {}, { q: "x" })));
    const frag = page(await engine.handle(get("/browse", { "hx-request": "true", "hx-target": "list" }, { q: "x" })));
    expect(frag).toBe('<div id="list">x<b>in</b></div>');
    expect(full).toContain(frag);
  });

  test("a nested fragment is addressable on its own", async () => {
    expect(page(await engine.handle(get("/browse", { "hx-request": "true", "hx-target": "inner" })))).toBe("<b>in</b>");
  });

  test("a target naming no fragment gets the ordinary htmx response", async () => {
    const body = page(await engine.handle(get("/browse", { "hx-request": "true", "hx-target": "nope" })));
    expect(body).toContain("<h1>Browse</h1>");
    expect(body).toContain("<footer>end</footer>");
  });

  test("no fragment syntax or mark reaches output", async () => {
    const body = page(await engine.handle(get("/browse")));
    expect(body).not.toContain("htx:fragment");
    expect(body).not.toContain("PRESTO:FRAGMENT");
  });

  test("template responses declare what changes the body", async () => {
    expect((await engine.handle(get("/browse"))).headers.Vary).toBe("HX-Request, HX-Target");
  });
});

describe("F5 required data and the 404 representation", () => {
  test("a known slug renders", async () => {
    const r = await engine.handle(get("/posts/hello"));
    expect(r.status).toBe(200);
    expect(page(r)).toContain("<h1>Hello</h1>");
  });

  test("an unknown slug is 404 with _404.htx inside the layout", async () => {
    const r = await engine.handle(get("/posts/nope"));
    expect(r.status).toBe(404);
    expect(page(r)).toContain("<nav>site</nav><h1>Gone: /posts/nope</h1>");
  });

  test("an unrouted URL uses the same representation", async () => {
    const r = await engine.handle(get("/no/such/page"));
    expect(r.status).toBe(404);
    expect(page(r)).toContain("Gone: /no/such/page");
  });

  test("without _404.htx the plain not-found is used", async () => {
    const r = await bare.handle(get("/x"));
    expect(r.status).toBe(404);
    expect(page(r)).toBe("<h1>404 Not Found</h1>");
  });
});

describe("F6 underscore paths are not routable", () => {
  test("partials and engine templates are 404 by URL", async () => {
    for (const p of ["/_partials/nav", "/_layout", "/_404"]) {
      expect((await engine.handle(get(p))).status).toBe(404);
    }
  });

  test("a page still includes them", async () => {
    expect(page(await engine.handle(get("/uses-partial")))).toContain("<p>partial</p>");
  });
});
