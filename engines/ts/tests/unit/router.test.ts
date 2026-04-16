import { describe, test, expect } from "bun:test";
import { Router } from "../../src/router";
import { join } from "node:path";

const TEMPLATES = join(import.meta.dir, "../../templates");

describe("Router", () => {
  const router = new Router(TEMPLATES);

  test("resolves static route (index)", () => {
    const match = router.resolve("/");
    expect(match).not.toBeNull();
    expect(match!.filePath).toContain("index.htx");
    expect(match!.params).toEqual({});
  });

  test("returns null for missing route (404)", () => {
    const match = router.resolve("/this-does-not-exist");
    expect(match).toBeNull();
  });

  test("resolves dynamic [slug] route with params", () => {
    const match = router.resolve("/blog/first-post");
    expect(match).not.toBeNull();
    expect(match!.filePath).toContain("[slug].htx");
    expect(match!.params.slug).toBe("first-post");
  });

  test("resolves dynamic route with different param value", () => {
    const match = router.resolve("/blog/another-slug");
    expect(match).not.toBeNull();
    expect(match!.params.slug).toBe("another-slug");
  });
});
