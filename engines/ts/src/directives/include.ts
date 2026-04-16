// PRESTO-TS v3 — Stage 6: htx:include expansion
// C2: circular detection via backtracking visited-path set. Allows diamond patterns.

import { readFileSync, existsSync } from "node:fs";
import { PathGuard } from "../security/path-guard";

const INCLUDE_RE = /<htx:include\s+src\s*=\s*"([^"]+)"\s*\/>/g;

export class IncludeResolver {
  constructor(
    private pathGuard: PathGuard,
    private templateRoot: string,
    private maxDepth: number = 10,
  ) {}

  resolve(content: string, currentFile: string, depth = 0, visited = new Set<string>()): string {
    if (depth > this.maxDepth) {
      return content.replace(INCLUDE_RE, "<!-- htx:include max depth exceeded -->");
    }

    return content.replace(INCLUDE_RE, (_match, src: string) => {
      const result = this.pathGuard.resolveTemplatePath(src, currentFile);
      if (!result.valid) {
        return `<!-- htx:include path error: ${result.error} -->`;
      }

      const filePath = result.resolved;

      // Circular detection: backtracking visited-path set
      if (visited.has(filePath)) {
        return `<!-- htx:include circular reference: ${src} -->`;
      }

      if (!existsSync(filePath)) {
        return `<!-- htx:include not found: ${src} -->`;
      }

      try {
        const fileContent = readFileSync(filePath, "utf-8");

        // Insert before recursion, remove after (allows diamond patterns)
        visited.add(filePath);
        const resolved = this.resolve(fileContent, filePath, depth + 1, visited);
        visited.delete(filePath);

        return resolved;
      } catch {
        return `<!-- htx:include error: ${src} -->`;
      }
    });
  }
}
