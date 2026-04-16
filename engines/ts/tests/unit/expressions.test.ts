import { describe, test, expect } from "bun:test";
import { ExpressionEngine } from "../../src/expressions";

const engine = new ExpressionEngine();

describe("Expression evaluation", () => {
  test("htx:v resolves simple path", () => {
    const result = engine.evaluate("<p><htx:v>name</htx:v></p>", { name: "Alice" });
    expect(result).toBe("<p>Alice</p>");
  });

  test("htx:v resolves nested path", () => {
    const result = engine.evaluate("<p><htx:v>user.name</htx:v></p>", { user: { name: "Bob" } });
    expect(result).toBe("<p>Bob</p>");
  });

  test("htx:v with pipe uppercase", () => {
    const result = engine.evaluate("<p><htx:v>name | uppercase</htx:v></p>", { name: "alice" });
    expect(result).toBe("<p>ALICE</p>");
  });

  test("htx:v with pipe capitalize", () => {
    const result = engine.evaluate("<p><htx:v>status | capitalize</htx:v></p>", { status: "published" });
    expect(result).toBe("<p>Published</p>");
  });

  test("htx:v HTML escapes by default", () => {
    const result = engine.evaluate("<p><htx:v>content</htx:v></p>", { content: '<script>alert("xss")</script>' });
    expect(result).toBe('<p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>');
  });

  test("htx:v raw outputs unescaped", () => {
    const result = engine.evaluate("<p><htx:v raw>content</htx:v></p>", { content: "<b>bold</b>" });
    expect(result).toBe("<p><b>bold</b></p>");
  });

  test("{htx:} attribute binding", () => {
    const result = engine.evaluate('<a href="/user/{htx:user.slug}">link</a>', { user: { slug: "alice" } });
    expect(result).toBe('<a href="/user/alice">link</a>');
  });

  test("script blocks are opaque — not processed", () => {
    const template = '<script>var x = "{htx:should.not.resolve}";</script><p><htx:v>name</htx:v></p>';
    const result = engine.evaluate(template, { name: "Alice" });
    expect(result).toContain('{htx:should.not.resolve}');
    expect(result).toContain("<p>Alice</p>");
  });

  test("htx:raw blocks are opaque — not processed", () => {
    const template = '<htx:raw><htx:v>not.evaluated</htx:v></htx:raw><p><htx:v>name</htx:v></p>';
    const result = engine.evaluate(template, { name: "Alice" });
    expect(result).toContain("<htx:v>not.evaluated</htx:v>");
    expect(result).toContain("<p>Alice</p>");
  });

  test("undefined path returns empty string", () => {
    const result = engine.evaluate("<p><htx:v>missing.path</htx:v></p>", {});
    expect(result).toBe("<p></p>");
  });

  test("pipe length on array", () => {
    const result = engine.evaluate("<p><htx:v>items | length</htx:v></p>", { items: [1, 2, 3] });
    expect(result).toBe("<p>3</p>");
  });

  test("pipe json serializes object", () => {
    // JSON output is HTML-escaped by default (htx:v escapes &<>")
    const result = engine.evaluate('<div data-config="<htx:v>config | json</htx:v>"></div>', { config: { a: 1 } });
    expect(result).toContain("{&quot;a&quot;:1}");
  });

  test("pipe json raw outputs unescaped", () => {
    const result = engine.evaluate('<htx:v raw>config | json</htx:v>', { config: { a: 1 } });
    expect(result).toBe('{"a":1}');
  });
});

describe("Truthiness", () => {
  test("null is falsy", () => expect(engine.isTruthy(null)).toBe(false));
  test("undefined is falsy", () => expect(engine.isTruthy(undefined)).toBe(false));
  test("false is falsy", () => expect(engine.isTruthy(false)).toBe(false));
  test("0 is falsy", () => expect(engine.isTruthy(0)).toBe(false));
  test("0.0 is falsy", () => expect(engine.isTruthy(0.0)).toBe(false));
  test("empty string is falsy", () => expect(engine.isTruthy("")).toBe(false));
  test("empty array is falsy", () => expect(engine.isTruthy([])).toBe(false));
  test("non-empty string is truthy", () => expect(engine.isTruthy("hello")).toBe(true));
  test("non-zero number is truthy", () => expect(engine.isTruthy(42)).toBe(true));
  test("non-empty array is truthy", () => expect(engine.isTruthy([1])).toBe(true));
  test("object is truthy", () => expect(engine.isTruthy({ a: 1 })).toBe(true));
  test("true is truthy", () => expect(engine.isTruthy(true)).toBe(true));
});
