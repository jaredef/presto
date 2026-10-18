// F8: the JSON file adapter (.plans/htxlang-closure-plan.md K3, K5, K10).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { JsonAdapter } from "../../src/adapters/json";
import { resolveData } from "../../src/directives/data";
import { TemplateError } from "../../src/types";
import { join } from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

let dir: string;
let a: JsonAdapter;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "presto-json-"));
  writeFileSync(join(dir, "project.json"), JSON.stringify([
    { id: 1, slug: "roof", service: "roofing", date: "2026-02", n: "10" },
    { id: 2, slug: "bath", service: "remodels", date: "2026-03", n: "9" },
    { id: 3, slug: "deck", service: "roofing", date: "2026-03", n: "2" },
  ]));
  a = new JsonAdapter(dir);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const slugs = (rows: { slug?: unknown }[]) => rows.map((r) => r.slug);

describe("query", () => {
  test("where with literals and bound params", () => {
    expect(slugs(a.query({ type: "project", where: "service = 'roofing'" }))).toEqual(["roof", "deck"]);
    expect(slugs(a.query({ type: "project", where: "service = ? AND slug != ?", params: ["roofing", "roof"] }))).toEqual(["deck"]);
    expect(slugs(a.query({ type: "project", where: "id = 2" }))).toEqual(["bath"]);
  });

  test("?= is equality that an empty value turns off", () => {
    expect(slugs(a.query({ type: "project", where: "service ?= ?", params: ["roofing"] }))).toEqual(["roof", "deck"]);
    expect(slugs(a.query({ type: "project", where: "service ?= ?", params: [""] }))).toEqual(["roof", "bath", "deck"]);
  });

  test("a bound value is only ever a value", () => {
    expect(a.query({ type: "project", where: "service = ?", params: ["x' OR '1'='1"] })).toEqual([]);
  });

  test("order is stable, multi-key and numeric-aware; limit and offset", () => {
    expect(slugs(a.query({ type: "project", order: "date desc" }))).toEqual(["bath", "deck", "roof"]);
    expect(slugs(a.query({ type: "project", order: "n asc" }))).toEqual(["deck", "bath", "roof"]);
    expect(slugs(a.query({ type: "project", order: "service asc, date desc" }))).toEqual(["bath", "deck", "roof"]);
    expect(slugs(a.query({ type: "project", order: "id asc", limit: 1, offset: 1 }))).toEqual(["bath"]);
  });

  test("a missing type is empty", () => {
    expect(a.query({ type: "nothing" })).toEqual([]);
  });

  test("anything outside the grammar fails closed", () => {
    const bad: Parameters<JsonAdapter["query"]>[0][] = [
      { type: "project", where: "slug LIKE 'r%'" },
      { type: "project", where: "service = roofing" },
      { type: "project", where: "service = ? AND slug = ?", params: ["roofing"] },
      { type: "project", where: "service = 'roofing'", params: ["extra"] },
      { type: "project", order: "date; drop" },
    ];
    for (const q of bad) expect(() => a.query(q)).toThrow(TemplateError);
  });
});

describe("get and writes", () => {
  test("get by slug or id", () => {
    expect(a.get("project", "deck")?.id).toBe(3);
    expect(a.get("project", 2)?.slug).toBe("bath");
    expect(a.get("project", "none")).toBeNull();
  });

  test("create, update, delete round trip through the file", () => {
    const r = a.create("project", { slug: "new", service: "roofing" });
    expect(r.id).toBe(4);
    expect(a.update("project", 4, { slug: "newer", id: 99 })).toBe(true);
    expect(a.get("project", "newer")?.id).toBe(4);
    expect(a.delete("project", 4)).toBe(true);
    expect(a.delete("project", 4)).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, "project.json"), "utf-8"))).toHaveLength(3);
  });
});

describe("with htx:data", () => {
  test("interpolated values arrive as params", () => {
    const data: Record<string, unknown> = { query: { s: "roofing" }, params: { slug: "roof" } };
    resolveData(`<htx:data type="project" where="service = '{htx:query.s}' AND slug != '{htx:params.slug}'" as="rows"/>`, data, a);
    expect(slugs(data.rows as { slug: string }[])).toEqual(["deck"]);
  });

  test("an adapter error is not swallowed into an empty list", () => {
    expect(() => resolveData(`<htx:data type="project" where="slug LIKE 'x'" as="rows"/>`, {}, a)).toThrow(TemplateError);
  });
});
