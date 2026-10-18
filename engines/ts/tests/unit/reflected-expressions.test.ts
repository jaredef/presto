// Printed data must not become an expression on a later pass, and htx:let
// values resolve their own {htx:} expressions exactly once.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrestoEngine } from "../../src/engine";
import { resolveLet, resolveDeferredLets } from "../../src/directives/let";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import type { ContentAdapter, DataContext, HtxRequest } from "../../src/types";

let ROOT: string;
let engine: PrestoEngine;

const posts = [{ id: 1, slug: "hello", title: "Hello {htx:query.secret}" }];
const adapter: ContentAdapter = {
  query: () => posts,
  get: (_type, id) => posts.find((p) => p.slug === id) ?? null,
  create: () => { throw new Error("read-only"); },
  update: () => false,
  delete: () => false,
};

function get(path: string, query: Record<string, string> = {}): HtxRequest {
  return { method: "GET", path, query, headers: {}, cookies: {}, body: {}, bodyRaw: "", contentType: "", hxRequest: false, auth: null };
}

beforeAll(() => {
  ROOT = mkdtempSync(join(tmpdir(), "presto-reflect-"));
  const t = join(ROOT, "templates");
  mkdirSync(join(t, "posts"), { recursive: true });
  mkdirSync(join(ROOT, "public"));
  writeFileSync(join(t, "_layout.htx"), "<html><head><title><htx:v>title</htx:v></title></head><body>__content__</body></html>");
  writeFileSync(join(t, "echo.htx"), '<p><htx:v>query.q</htx:v></p><input value="{htx:query.q}"><htx:let said="You said {htx:query.q}"/><b><htx:v>said</htx:v></b>');
  writeFileSync(join(t, "posts", "[slug].htx"), `<htx:data type="post" where="slug = '{htx:params.slug}'" as="post"/><htx:let title="{htx:post.0.title} | Blog"/><h1><htx:v>post.0.title</htx:v></h1>`);
  writeFileSync(join(t, "branch.htx"), "<htx:if test=\"query.q\"><i><htx:v>query.q</htx:v></i></htx:if><htx:each items=\"rows\" as=\"r\"><u>{htx:r}</u></htx:each><htx:let rows=\"\"/>");
  writeFileSync(join(t, "rawval.htx"), "<div><htx:v raw>query.html</htx:v></div>");
  writeFileSync(join(t, "_alt.htx"), "<main data-alt>__content__</main>");
  writeFileSync(join(t, "dynlayout.htx"), "<htx:layout src=\"{htx:query.l}\"/><p>in</p>");
  engine = new PrestoEngine({ templateDir: t, publicDir: join(ROOT, "public"), secret: "reflect-test-secret", adapter });
});

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe("reflected {htx:} stays literal", () => {
  test("a query value is printed, not evaluated", async () => {
    const body = String((await engine.handle(get("/echo", { q: "{htx:request.path}", secret: "s3cret" }))).body);
    expect(body).not.toContain("/echo");
    expect(body).toContain("<p>{htx:request.path}</p>");
    expect(body).toContain('value="{htx:request.path}"');
    expect(body).toContain("<b>You said {htx:request.path}</b>");
  });

  test("two printed halves cannot join into an expression", async () => {
    const body = String((await engine.handle(get("/echo", { q: "{", secret: "s3cret" }))).body);
    expect(body).toContain("<p>{</p>");
  });

  test("record content carrying {htx:} is printed literally", async () => {
    const body = String((await engine.handle(get("/posts/hello", { secret: "s3cret" }))).body);
    expect(body).not.toContain("s3cret");
    expect(body).toContain("<h1>Hello {htx:query.secret}</h1>");
  });
});

describe("htx:let expressions", () => {
  test("a let can name data loaded later on the page", async () => {
    const body = String((await engine.handle(get("/posts/hello"))).body);
    expect(body).toContain("<title>Hello {htx:query.secret} | Blog</title>");
  });

  test("paths already in context resolve at once; others after htx:data", () => {
    const data: DataContext = { query: { q: "x" } };
    resolveLet('<htx:let a="{htx:query.q}-{htx:later.name}"/>', data);
    expect(data.a).toBe("x-");
    data.later = { name: "y" };
    resolveDeferredLets(data);
    expect(data.a).toBe("x-y");
    expect(data.__letDeferred).toBeUndefined();
  });

  test("a let resolves before it shadows the context it reads", () => {
    const data: DataContext = { query: { q: "term" } };
    resolveLet('<htx:let query="{htx:query.q}"/>', data);
    expect(data.query).toBe("term");
  });
});

describe("single emission (F7)", () => {
  const SLOT = /\uE000|\uE001/;

  test("a value printed inside an htx:if branch is not evaluated again", async () => {
    const body = String((await engine.handle(get("/branch", { q: "{htx:request.path}" }))).body);
    expect(body).toContain("<i>{htx:request.path}</i>");
    expect(body).not.toContain("/branch");
  });

  test("a raw value carrying directives is output, not resolved", async () => {
    const body = String((await engine.handle(get("/rawval", { html: "<htx:include src=\"/_alt.htx\"/><htx:v>request.path</htx:v>" }))).body);
    expect(body).toContain("<div><htx:include src=\"/_alt.htx\"/><htx:v>request.path</htx:v></div>");
  });

  test("htx:layout src may come from an expression", async () => {
    const body = String((await engine.handle(get("/dynlayout", { l: "/_alt.htx" }))).body);
    expect(body).toContain("<main data-alt>");
    expect(body).toContain("<p>in</p>");
  });

  test("no value placeholder reaches the output", async () => {
    for (const [p, q] of [["/echo", { q: "x" }], ["/posts/hello", {}], ["/branch", { q: "y" }]] as const) {
      expect(String((await engine.handle(get(p, q))).body)).not.toMatch(SLOT);
    }
  });
});
