import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { resolveControlFlow } from "../../src/directives/control-flow";
import { resolveAuth } from "../../src/directives/auth";
import { resolveLet } from "../../src/directives/let";
import { resolveData } from "../../src/directives/data";
import { SqliteAdapter } from "../../src/adapters/sqlite";
import { ExpressionEngine } from "../../src/expressions";
import { join } from "node:path";
import { unlinkSync, existsSync } from "node:fs";
import type { DataContext } from "../../src/types";

const DB_PATH = join(import.meta.dir, "test-control-flow.sqlite");
let adapter: SqliteAdapter;

beforeAll(() => {
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  adapter = new SqliteAdapter(DB_PATH);
  adapter.exec("CREATE TABLE IF NOT EXISTS post (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, title TEXT, body TEXT, status TEXT)");
  adapter.exec("INSERT INTO post (slug, title, body, status) VALUES ('first', 'First Post', 'Content 1', 'published')");
  adapter.exec("INSERT INTO post (slug, title, body, status) VALUES ('second', 'Second Post', 'Content 2', 'published')");
  adapter.exec("INSERT INTO post (slug, title, body, status) VALUES ('draft', 'Draft Post', 'Hidden', 'draft')");
});

afterAll(() => {
  adapter.close();
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  // Clean up WAL/SHM files
  if (existsSync(DB_PATH + "-wal")) unlinkSync(DB_PATH + "-wal");
  if (existsSync(DB_PATH + "-shm")) unlinkSync(DB_PATH + "-shm");
});

describe("htx:let", () => {
  test("binds a variable into data context", () => {
    const data: DataContext = {};
    const result = resolveLet('<htx:let greeting="Hello World" /><p>{greeting}</p>', data);
    expect(data.greeting).toBe("Hello World");
    expect(result).not.toContain("htx:let");
  });
});

describe("htx:data", () => {
  test("queries published posts", () => {
    const data: DataContext = {};
    resolveData('<htx:data type="post" where="status = \'published\'" order="id desc" limit="10" as="posts" />', data, adapter);
    expect(Array.isArray(data.posts)).toBe(true);
    expect((data.posts as any[]).length).toBe(2);
  });

  test("queries with slug lookup via expression", () => {
    const data: DataContext = { params: { slug: "first" } };
    resolveData('<htx:data type="post" where="slug = \'{htx:params.slug}\'" limit="1" as="post_list" />', data, adapter);
    expect(Array.isArray(data.post_list)).toBe(true);
    expect((data.post_list as any[]).length).toBe(1);
    expect((data.post_list as any[])[0].title).toBe("First Post");
  });

  test("returns empty array for no matches", () => {
    const data: DataContext = { params: { slug: "nonexistent" } };
    resolveData('<htx:data type="post" where="slug = \'{htx:params.slug}\'" limit="1" as="items" />', data, adapter);
    expect((data.items as any[]).length).toBe(0);
  });
});

describe("htx:each", () => {
  test("iterates over array and renders items", () => {
    const data: DataContext = { items: [{ name: "A" }, { name: "B" }, { name: "C" }] };
    const template = '<htx:each items="items" as="item"><p><htx:v>item.name</htx:v></p></htx:each>';
    const result = resolveControlFlow(template, data);
    expect(result).toContain("<p>A</p>");
    expect(result).toContain("<p>B</p>");
    expect(result).toContain("<p>C</p>");
  });

  test("provides $index, $first, $last", () => {
    const data: DataContext = { items: [{ n: "x" }, { n: "y" }] };
    const template = '<htx:each items="items" as="item"><span><htx:v>$index</htx:v></span></htx:each>';
    const result = resolveControlFlow(template, data);
    expect(result).toContain("<span>0</span>");
    expect(result).toContain("<span>1</span>");
  });

  test("renders htx:empty for empty array", () => {
    const data: DataContext = { items: [] };
    const template = '<htx:each items="items" as="item"><p>item</p><htx:empty /><p>No items</p></htx:each>';
    const result = resolveControlFlow(template, data);
    expect(result).toContain("No items");
    expect(result).not.toContain("<p>item</p>");
  });

  test("renders htx:empty for undefined items", () => {
    const data: DataContext = {};
    const template = '<htx:each items="missing" as="item"><p>item</p><htx:empty /><p>Empty</p></htx:each>';
    const result = resolveControlFlow(template, data);
    expect(result).toContain("Empty");
  });

  // Nesting: an each inside an each pairs with its own close, and the inner
  // item is in scope for the inner body.
  test("resolves an each nested in an each", () => {
    const data: DataContext = { qs: [{ t: "A", as: [{ x: "a1" }, { x: "a2" }] }, { t: "B", as: [{ x: "b1" }] }] };
    const template = '<htx:each items="qs" as="q">[<htx:v>q.t</htx:v>:<htx:each items="q.as" as="a">(<htx:v>a.x</htx:v>)</htx:each>]</htx:each>';
    const result = new ExpressionEngine().evaluate(resolveControlFlow(template, data), data);
    expect(result).toBe("[A:(a1)(a2)][B:(b1)]");
  });

  test("an inner htx:empty belongs to the inner each", () => {
    const data: DataContext = { qs: [{ t: "A", as: [] }, { t: "B", as: [{ x: "b1" }] }] };
    const template = '<htx:each items="qs" as="q">[<htx:v>q.t</htx:v>:<htx:each items="q.as" as="a">(<htx:v>a.x</htx:v>)<htx:empty />none</htx:each>]</htx:each>';
    const result = new ExpressionEngine().evaluate(resolveControlFlow(template, data), data);
    expect(result).toBe("[A:none][B:(b1)]");
  });

  test("an htx:if inside a nested each sees the inner item", () => {
    const data: DataContext = { qs: [{ as: [{ x: "a1", on: true }, { x: "a2", on: false }] }] };
    const template = '<htx:each items="qs" as="q"><htx:each items="q.as" as="a"><i><htx:v>a.x</htx:v><htx:if test="a.on">*</htx:if></i></htx:each></htx:each>';
    const result = new ExpressionEngine().evaluate(resolveControlFlow(template, data), data);
    expect(result).toBe("<i>a1*</i><i>a2</i>");
  });

  test("sibling eaches stay separate", () => {
    const data: DataContext = { a: [{ n: 1 }, { n: 2 }], b: [{ n: 3 }] };
    const template = '<htx:each items="a" as="i"><htx:v>i.n</htx:v></htx:each>|<htx:each items="b" as="i"><htx:v>i.n</htx:v></htx:each>';
    const result = new ExpressionEngine().evaluate(resolveControlFlow(template, data), data);
    expect(result).toBe("12|3");
  });
});

describe("htx:if/htx:else", () => {
  test("shows if-content when truthy", () => {
    const data: DataContext = { show: true };
    const template = '<htx:if test="show"><p>visible</p></htx:if>';
    const result = resolveControlFlow(template, data);
    expect(result).toContain("visible");
  });

  test("hides if-content when falsy", () => {
    const data: DataContext = { show: false };
    const template = '<htx:if test="show"><p>hidden</p></htx:if>';
    const result = resolveControlFlow(template, data);
    expect(result).not.toContain("hidden");
  });

  test("shows else-content when condition is false", () => {
    const data: DataContext = { loggedIn: false };
    const template = '<htx:if test="loggedIn"><p>Welcome</p></htx:if><htx:else><p>Please sign in</p></htx:else>';
    const result = resolveControlFlow(template, data);
    expect(result).toContain("Please sign in");
    expect(result).not.toContain("Welcome");
  });

  test("shows if-content and hides else when truthy", () => {
    const data: DataContext = { loggedIn: true };
    const template = '<htx:if test="loggedIn"><p>Welcome</p></htx:if><htx:else><p>Sign in</p></htx:else>';
    const result = resolveControlFlow(template, data);
    expect(result).toContain("Welcome");
    expect(result).not.toContain("Sign in");
  });

  // Nesting: an if inside an if pairs with its own close, and an else
  // belongs to the if it follows.
  test("resolves an if nested in an if", () => {
    const data: DataContext = { a: true, b: true, c: false };
    const template = '<htx:if test="a">A<htx:if test="b">B</htx:if><htx:if test="c">C</htx:if>Z</htx:if>';
    expect(resolveControlFlow(template, data)).toBe("ABZ");
  });

  test("a false outer if hides its nested ifs and takes its own else", () => {
    const data: DataContext = { b: true, c: false };
    const template = '<htx:if test="c">no<htx:if test="b">B</htx:if>no</htx:if><htx:else>E</htx:else>';
    expect(resolveControlFlow(template, data)).toBe("E");
  });

  test("a nested if keeps its own else inside the outer else", () => {
    const data: DataContext = { a: false, b: false };
    const template = '<htx:if test="a">A</htx:if><htx:else>[<htx:if test="b">B</htx:if><htx:else>not b</htx:else>]</htx:else>';
    expect(resolveControlFlow(template, data)).toBe("[not b]");
  });
});

describe("htx:auth/htx:unauth", () => {
  test("htx:auth shows content for authenticated user", () => {
    const data: DataContext = { auth: { user: { id: "1", name: "Alice" } } };
    const result = resolveAuth('<htx:auth><p>Hello</p></htx:auth>', data);
    expect(result).toContain("Hello");
  });

  test("htx:auth hides content for unauthenticated", () => {
    const data: DataContext = { auth: null };
    const result = resolveAuth('<htx:auth><p>Secret</p></htx:auth>', data);
    expect(result).not.toContain("Secret");
  });

  test("htx:unauth shows content for unauthenticated", () => {
    const data: DataContext = { auth: null };
    const result = resolveAuth('<htx:unauth><p>Guest view</p></htx:unauth>', data);
    expect(result).toContain("Guest view");
  });

  test("htx:unauth hides content for authenticated", () => {
    const data: DataContext = { auth: { user: { id: "1", name: "Alice" } } };
    const result = resolveAuth('<htx:unauth><p>Guest</p></htx:unauth>', data);
    expect(result).not.toContain("Guest");
  });

  test("htx:auth with role check", () => {
    const data: DataContext = { auth: { user: { id: "1", name: "Alice", role: "admin" } } };
    const admin = resolveAuth('<htx:auth role="admin"><p>Admin panel</p></htx:auth>', data);
    expect(admin).toContain("Admin panel");
    const user = resolveAuth('<htx:auth role="superadmin"><p>Super</p></htx:auth>', data);
    expect(user).not.toContain("Super");
  });
});
