// htx:data binds {htx:} values as parameters (K3), takes the get() shortcut only for a
// whole-where slug equality, and lets a later directive read an earlier one's result (F3).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { SqliteAdapter } from "../../src/adapters/sqlite";
import { resolveData } from "../../src/directives/data";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import type { DataContext } from "../../src/types";

let dir: string;
let adapter: SqliteAdapter;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "presto-bind-"));
  adapter = new SqliteAdapter(join(dir, "bind.db"));
  adapter.create("post", { slug: "live", title: "Live", status: "published" });
  adapter.create("post", { slug: "draft", title: "Draft", status: "draft" });
  adapter.create("post", { slug: "other-live", title: "Other", status: "published" });
});

afterAll(() => {
  adapter.close();
  rmSync(dir, { recursive: true, force: true });
});

const run = (tpl: string, data: DataContext) => (resolveData(tpl, data, adapter), data);

describe("values are bound, not spliced (K3)", () => {
  test("a quote-breaking query value matches nothing", () => {
    const d = run(`<htx:data type="post" where="status = '{htx:query.s}'" as="rows"/>`, { query: { s: "x' OR '1'='1" } });
    expect(d.rows).toEqual([]);
  });

  test("the same clause with an honest value still filters", () => {
    const d = run(`<htx:data type="post" where="status = '{htx:query.s}'" order="id asc" as="rows"/>`, { query: { s: "published" } });
    expect((d.rows as { slug: string }[]).map((r) => r.slug)).toEqual(["live", "other-live"]);
  });

  test("a bare {htx:} binds too", () => {
    const d = run(`<htx:data type="post" where="id = {htx:query.id}" as="rows"/>`, { query: { id: "2 OR 1=1" } });
    expect(d.rows).toEqual([]);
  });
});

describe("the slug shortcut takes only a whole-where slug equality", () => {
  test("slug AND status is a query: a draft is not returned as published", () => {
    const d = run(`<htx:data type="post" where="slug = '{htx:params.slug}' AND status = 'published'" as="rows"/>`, { params: { slug: "draft" } });
    expect(d.rows).toEqual([]);
  });

  test("slug alone still uses get()", () => {
    const d = run(`<htx:data type="post" where="slug = '{htx:params.slug}'" as="rows"/>`, { params: { slug: "draft" } });
    expect((d.rows as { title: string }[])[0].title).toBe("Draft");
  });
});

describe("chaining (F3)", () => {
  test("a later htx:data reads an earlier one's result", () => {
    const d = run(
      `<htx:data type="post" where="slug = '{htx:params.slug}'" as="post"/>` +
      `<htx:data type="post" where="status = '{htx:post.0.status}' AND slug != '{htx:post.0.slug}'" as="related"/>`,
      { params: { slug: "live" } },
    );
    expect((d.related as { slug: string }[]).map((r) => r.slug)).toEqual(["other-live"]);
  });
});
