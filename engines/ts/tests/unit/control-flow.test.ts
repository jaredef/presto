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
