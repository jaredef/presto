// The expression grammar (F1 comparisons, F2 pipes): one closed alphabet for htx:v,
// {htx:} and htx:if, failing closed outside it (.plans/htxlang-closure-plan.md K5, K8, K9).

import { describe, test, expect } from "bun:test";
import { ExpressionEngine } from "../../src/expressions";
import { resolveControlFlow } from "../../src/directives/control-flow";
import { TemplateError } from "../../src/types";

const e = new ExpressionEngine();
const data = {
  query: { service: "roofing", page: "3", empty: "" },
  f: { key: "roofing" },
  rest: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  one: [1],
  n: "3",
  name: "",
  filters: [{ key: "" }, { key: "roofing" }, { key: "remodels" }],
};
const t = (s: string) => e.test(s, data);
const v = (s: string) => e.resolvePath(s, data);

describe("F1 comparisons", () => {
  test("equality between paths and literals", () => {
    expect(t("f.key == query.service")).toBe(true);
    expect(t("f.key != 'remodels'")).toBe(true);
    expect(t("query.empty == ''")).toBe(true);
    expect(t("missing.path == ''")).toBe(true);
  });

  test("numeric text compares as numbers", () => {
    expect(t("query.page == 3")).toBe(true);
    expect(t("query.page gt 10")).toBe(false);
    expect(t("rest|length ge 11")).toBe(true);
    expect(t("'10' gt '9'")).toBe(true);
  });

  test("non-numeric text compares as text", () => {
    expect(t("'apple' lt 'banana'")).toBe(true);
  });

  test("and, or, not, with not binding tightest", () => {
    expect(t("not query.empty and f.key")).toBe(true);
    expect(t("query.empty or f.key == 'x'")).toBe(false);
    expect(t("query.empty or rest")).toBe(true);
    expect(t("not not one")).toBe(true);
  });

  test("a lone path keeps truthiness", () => {
    expect(t("rest")).toBe(true);
    expect(t("query.empty")).toBe(false);
  });

  test("an htx:if inside htx:each compares the item with the context", () => {
    const out = resolveControlFlow(
      '<htx:each items="filters" as="c"><htx:if test="c.key == query.service">[on]</htx:if><htx:else>[off]</htx:else></htx:each>',
      data,
    );
    expect(out).toBe("[off][on][off]");
  });

  test("malformed tests fail closed", () => {
    for (const bad of ["a ==", "== a", "a = b", "a === b", "a < b", "a and", "not", "(a)", "a b", "and == b"]) {
      expect(() => t(bad)).toThrow(TemplateError);
    }
  });
});

describe("F2 pipes", () => {
  test("chains and arguments", () => {
    expect(v("n|plus:1|pad:2")).toBe("04");
    expect(v("rest|length|minus:9")).toBe(2);
    expect(v("rest|minus:9")).toBe(2);
    expect(v("name|default:'Guest'")).toBe("Guest");
    expect(v("rest|length|plural:'project':'projects'")).toBe("projects");
    expect(v("one|plural:'project':'projects'")).toBe("project");
    expect(v("query.service | uppercase")).toBe("ROOFING");
  });

  test("arguments may contain spaces and colons inside quotes", () => {
    expect(v("name|default:'a: b'")).toBe("a: b");
  });

  test("an unknown pipe or a wrong argument fails closed", () => {
    for (const bad of ["n|nope", "n|plus", "n|plus:'x'", "n|pad", "n|plural:'a'", "n|uppercase:1", "n|", "n|plus:other.path"]) {
      expect(() => v(bad)).toThrow(TemplateError);
    }
  });

  test("htx:v and {htx:} share the grammar", () => {
    expect(e.evaluate("<b><htx:v>n|plus:1</htx:v></b><i title=\"{htx:rest|length}\"></i>", data)).toBe('<b>4</b><i title="11"></i>');
    expect(() => e.evaluate("<htx:v>n|bogus</htx:v>", data)).toThrow(TemplateError);
  });
});
