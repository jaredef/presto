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
  engine = new PrestoEngine({ templateDir: t, publicDir: join(ROOT, "public"), secret: "reflect-test-secret", adapter });
});

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe("reflected {htx:} stays literal", () => {
  test("a query value is printed, not evaluated", async () => {
    const body = String((await engine.handle(get("/echo", { q: "{htx:request.path}", secret: "s3cret" }))).body);
    expect(body).not.toContain("/echo");
    expect(body).toContain("<p>&#123;htx:request.path}</p>");
    expect(body).toContain('value="&#123;htx:request.path}"');
    expect(body).toContain("<b>You said &#123;htx:request.path}</b>");
  });

  test("two printed halves cannot join into an expression", async () => {
    const body = String((await engine.handle(get("/echo", { q: "{", secret: "s3cret" }))).body);
    expect(body).toContain("<p>&#123;</p>");
  });

  test("record content carrying {htx:} is printed literally", async () => {
    const body = String((await engine.handle(get("/posts/hello", { secret: "s3cret" }))).body);
    expect(body).not.toContain("s3cret");
    expect(body).toContain("<h1>Hello &#123;htx:query.secret}</h1>");
  });
});

describe("htx:let expressions", () => {
  test("a let can name data loaded later on the page", async () => {
    const body = String((await engine.handle(get("/posts/hello"))).body);
    expect(body).toContain("<title>Hello &#123;htx:query.secret} | Blog</title>");
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
