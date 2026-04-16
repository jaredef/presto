import { describe, test, expect } from "bun:test";
import { PathGuard } from "../../src/security/path-guard";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TEMPLATES = join(import.meta.dir, "../../templates");

// Ensure templates dir exists for tests
if (!existsSync(TEMPLATES)) {
  mkdirSync(TEMPLATES, { recursive: true });
}

describe("PathGuard", () => {
  const guard = new PathGuard(TEMPLATES);

  test("rejects paths containing ..", () => {
    const result = guard.validate("../../../etc/passwd");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("..");
  });

  test("rejects relative .. in template paths", () => {
    const result = guard.resolveTemplatePath("../../etc/passwd", join(TEMPLATES, "index.htx"));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("..");
  });

  test("accepts valid absolute path", () => {
    // Write a test file
    const testFile = join(TEMPLATES, "_test_guard.htx");
    writeFileSync(testFile, "test");

    const result = guard.validate("_test_guard.htx");
    expect(result.valid).toBe(true);
    expect(result.resolved).toContain("_test_guard.htx");

    // Cleanup
    require("node:fs").unlinkSync(testFile);
  });

  test("accepts valid root-relative path in template resolution", () => {
    const testFile = join(TEMPLATES, "_test_guard2.htx");
    writeFileSync(testFile, "test");

    const result = guard.resolveTemplatePath("/_test_guard2.htx", join(TEMPLATES, "sub/page.htx"));
    expect(result.valid).toBe(true);
    expect(result.resolved).toContain("_test_guard2.htx");

    require("node:fs").unlinkSync(testFile);
  });

  test("resolveTemplatePath containment rejects paths outside root", () => {
    // A relative path from a file near the root that would escape via enough ../ segments
    // Since we pre-filter .., this is caught at layer 1
    const result = guard.resolveTemplatePath("../../../etc/passwd", join(TEMPLATES, "index.htx"));
    expect(result.valid).toBe(false);
  });

  test("validate treats paths as root-relative", () => {
    // /tmp/evil stripped of leading / becomes tmp/evil, resolved under templates/
    // This is correct — validate() takes paths relative to the template root
    // The containment check ensures the result stays inside the root
    const result = guard.validate("tmp/evil");
    expect(result.valid).toBe(true); // valid path (file just doesn't exist)
    expect(result.resolved).toContain("templates");
  });
});
