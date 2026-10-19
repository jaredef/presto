import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrestoEngine } from "../../src/engine";
import { stripComments } from "../../src/directives/comments";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import type { ContentAdapter, HtxRequest } from "../../src/types";

describe("stripComments", () => {
  const quiet = () => {};

  test("removes a comment and the line it sits on alone", () => {
    expect(stripComments("<p>a</p>\n  <!-- a note\n  over two lines -->\n<p>b</p>", quiet)).toBe("<p>a</p>\n<p>b</p>");
  });

  test("a comment inside a line leaves the rest of the line", () => {
    expect(stripComments("<p>a<!-- x -->b</p>", quiet)).toBe("<p>ab</p>");
    expect(stripComments("  <!-- x --><p>c</p>\n", quiet)).toBe("  <p>c</p>\n");
  });

  test("script, style, pre, textarea and htx:raw contents are text, not markup", () => {
    const keep = [
      "<script>if (a <!--b) x(); // <!-- not a comment --></script>",
      "<style>/* <!-- */ p{}</style>",
      "<pre><!-- shown --></pre>",
      "<textarea><!-- typed --></textarea>",
      "<htx:raw><!-- literal --></htx:raw>",
    ];
    for (const k of keep) expect(stripComments(k, quiet)).toBe(k);
    expect(stripComments("<!-- a --><script>x</script><!-- b -->", quiet)).toBe("<script>x</script>");
  });

  test("engine diagnostics are logged on the server instead", () => {
    const logged: string[] = [];
    expect(stripComments("<div><!-- htx:include not found: /x.htx --></div>", (m) => logged.push(m))).toBe("<div></div>");
    expect(logged).toEqual(["[presto] htx:include not found: /x.htx"]);
  });
});

describe("resolved representations carry no comments", () => {
  let ROOT: string;
  let engine: PrestoEngine;
  const adapter: ContentAdapter = { query: () => [], get: () => null, create: () => { throw new Error("read-only"); }, update: () => false, delete: () => false };
  const get = (path: string, headers: Record<string, string> = {}): HtxRequest =>
    ({ method: "GET", path, query: {}, headers, cookies: {}, body: {}, bodyRaw: "", contentType: "", hxRequest: "hx-request" in headers, auth: null });

  beforeAll(() => {
    ROOT = mkdtempSync(join(tmpdir(), "presto-comments-"));
    const t = join(ROOT, "templates");
    mkdirSync(join(t, "_partials"), { recursive: true });
    mkdirSync(join(ROOT, "public"));
    writeFileSync(join(t, "_layout.htx"), "<!DOCTYPE html>\n<!-- layout note -->\n<html><body>__content__</body></html>");
    writeFileSync(join(t, "_partials", "p.htx"), "<!-- partial note --><p>partial</p>");
    writeFileSync(join(t, "page.htx"), [
      "<!-- page note -->",
      "<htx:include src=\"/_partials/p.htx\"/>",
      "<htx:include src=\"/_partials/missing.htx\"/>",
      "<htx:fragment name=\"box\"><div id=\"box\"><!-- in the fragment -->box</div></htx:fragment>",
      "<script>// <!-- client -->\n</script>",
    ].join("\n"));
    engine = new PrestoEngine({ templateDir: t, publicDir: join(ROOT, "public"), secret: "s".repeat(32), adapter });
  });
  afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

  test("full page: layout, page, partial and diagnostic comments are gone; script kept", async () => {
    const body = String((await engine.handle(get("/page"))).body);
    expect(body).toStartWith("<!DOCTYPE html>");
    expect(body).not.toMatch(/<!--(?! client)/);
    expect(body).toContain("<p>partial</p>");
    expect(body).toContain("// <!-- client -->");
  });

  test("fragment: the region alone, without its comments", async () => {
    const body = String((await engine.handle(get("/page", { "hx-request": "true", "hx-target": "box" }))).body);
    expect(body).toBe("<div id=\"box\">box</div>");
  });
});
