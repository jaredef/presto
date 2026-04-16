import { describe, test, expect } from "bun:test";
import { IncludeResolver } from "../../src/directives/include";
import { ComponentResolver } from "../../src/directives/component";
import { PathGuard } from "../../src/security/path-guard";
import { join } from "node:path";

const TEMPLATES = join(import.meta.dir, "../../templates");
const guard = new PathGuard(TEMPLATES);

describe("IncludeResolver", () => {
  const resolver = new IncludeResolver(guard, TEMPLATES);

  test("expands include with absolute path", () => {
    const content = '<htx:include src="/partials/nav.htx" />';
    const result = resolver.resolve(content, join(TEMPLATES, "index.htx"));
    expect(result).toContain("Home | About | Blog");
  });

  test("expands include with relative path", () => {
    const content = '<htx:include src="partials/header.htx" />';
    const result = resolver.resolve(content, join(TEMPLATES, "index.htx"));
    expect(result).toContain("PRESTO/TS v3");
  });

  test("produces HTML comment for missing include", () => {
    const content = '<htx:include src="/partials/nonexistent.htx" />';
    const result = resolver.resolve(content, join(TEMPLATES, "index.htx"));
    expect(result).toContain("<!-- htx:include not found");
  });

  test("rejects path traversal in include src", () => {
    const content = '<htx:include src="../../etc/passwd" />';
    const result = resolver.resolve(content, join(TEMPLATES, "index.htx"));
    expect(result).toContain("<!-- htx:include path error");
  });

  test("detects circular reference", () => {
    // Simulate by manually adding current file to visited set
    const content = '<htx:include src="/partials/nav.htx" />';
    const visited = new Set([join(TEMPLATES, "partials/nav.htx")]);
    const result = resolver.resolve(content, join(TEMPLATES, "index.htx"), 0, visited);
    expect(result).toContain("<!-- htx:include circular reference");
  });
});

describe("ComponentResolver", () => {
  const resolver = new ComponentResolver(guard, TEMPLATES);

  test("renders component with props and slot", () => {
    const content = '<htx:component src="/components/card.htx" title="Hello"><p>body</p></htx:component>';
    const scripts: string[] = [];
    const result = resolver.resolve(content, join(TEMPLATES, "index.htx"), scripts);
    expect(result).toContain("Hello");
    expect(result).toContain("<p>body</p>");
    expect(result).toContain("card");
  });

  test("uses default prop when not overridden", () => {
    const content = '<htx:component src="/components/card.htx"><p>body</p></htx:component>';
    const scripts: string[] = [];
    const result = resolver.resolve(content, join(TEMPLATES, "index.htx"), scripts);
    expect(result).toContain("Default Title");
  });

  test("extracts htx:script into scriptCollector with IIFE wrapping", () => {
    const content = '<htx:component src="/components/card-with-script.htx" title="Interactive"><p>click me</p></htx:component>';
    const scripts: string[] = [];
    const result = resolver.resolve(content, join(TEMPLATES, "index.htx"), scripts);
    expect(scripts.length).toBe(1);
    expect(scripts[0]).toContain("addEventListener");
    expect(scripts[0]).toContain("data-htx-id");
    expect(result).toContain('data-htx-id=');
  });

  test("produces HTML comment for missing component", () => {
    const content = '<htx:component src="/components/nonexistent.htx" />';
    const scripts: string[] = [];
    const result = resolver.resolve(content, join(TEMPLATES, "index.htx"), scripts);
    expect(result).toContain("<!-- htx:component not found");
  });
});
