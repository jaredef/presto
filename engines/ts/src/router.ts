// PRESTO-TS v3 — File-based Router
// Static, index, and dynamic [param] resolution. MUST scan directory for param names.

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RouteMatch } from "./types";

export class Router {
  constructor(private templateRoot: string) {}

  resolve(urlPath: string): RouteMatch | null {
    const cleanPath = urlPath.replace(/^\/+|\/+$/g, "") || "index";

    // 1. Static: templateDir + path + ".htx"
    const staticPath = join(this.templateRoot, cleanPath + ".htx");
    if (existsSync(staticPath)) {
      return { filePath: staticPath, params: {} };
    }

    // 2. Index: templateDir + path + "/index.htx"
    const indexPath = join(this.templateRoot, cleanPath, "index.htx");
    if (existsSync(indexPath)) {
      return { filePath: indexPath, params: {} };
    }

    // 3. Dynamic: walk segments, try exact match then [param].htx or [param]/
    return this.resolveDynamic(cleanPath);
  }

  private resolveDynamic(cleanPath: string): RouteMatch | null {
    const segments = cleanPath.split("/");
    return this.walkSegments(this.templateRoot, segments, 0, {});
  }

  private walkSegments(
    dir: string,
    segments: string[],
    index: number,
    params: Record<string, string>,
  ): RouteMatch | null {
    if (index >= segments.length) return null;

    const segment = segments[index];
    const isLast = index === segments.length - 1;

    // Try exact match first
    if (isLast) {
      const exactFile = join(dir, segment + ".htx");
      if (existsSync(exactFile)) {
        return { filePath: exactFile, params: { ...params } };
      }
    } else {
      const exactDir = join(dir, segment);
      if (existsSync(exactDir)) {
        const result = this.walkSegments(exactDir, segments, index + 1, params);
        if (result) return result;
      }
    }

    // Scan directory for [param].htx or [param]/ — MUST NOT assume parameter names
    if (!existsSync(dir)) return null;

    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const match = entry.name.match(/^\[([^\]]+)\]/);
      if (!match) continue;

      const paramName = match[1];

      if (isLast && entry.isFile() && entry.name === `[${paramName}].htx`) {
        return {
          filePath: join(dir, entry.name),
          params: { ...params, [paramName]: segment },
        };
      }

      if (!isLast && entry.isDirectory() && entry.name === `[${paramName}]`) {
        const result = this.walkSegments(
          join(dir, entry.name),
          segments,
          index + 1,
          { ...params, [paramName]: segment },
        );
        if (result) return result;
      }
    }

    // Last segment: check for [param] directory with index.htx
    if (isLast) {
      for (const entry of entries) {
        const match = entry.name.match(/^\[([^\]]+)\]$/);
        if (match && entry.isDirectory()) {
          const indexFile = join(dir, entry.name, "index.htx");
          if (existsSync(indexFile)) {
            return {
              filePath: indexFile,
              params: { ...params, [match[1]]: segment },
            };
          }
        }
      }
    }

    return null;
  }
}
