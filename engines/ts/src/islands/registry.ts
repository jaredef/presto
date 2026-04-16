// Island Registry — Server-side manifest
// Scans an islands directory and maps names to bundle paths.

import { readdirSync, statSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";

export interface IslandEntry {
  name: string;
  bundle: string;
  size: number;
}

export interface IslandManifest {
  islands: Record<string, IslandEntry>;
}

// Scan a directory for built island bundles (.js files)
export function scanIslandBundles(bundleDir: string, urlPrefix: string = "/js/islands"): IslandManifest {
  const manifest: IslandManifest = { islands: {} };

  if (!existsSync(bundleDir)) return manifest;

  const files = readdirSync(bundleDir);
  for (const file of files) {
    if (!file.endsWith(".js")) continue;
    const name = basename(file, ".js");
    const fullPath = join(bundleDir, file);
    let size = 0;
    try { size = statSync(fullPath).size; } catch {}

    manifest.islands[name] = {
      name,
      bundle: `${urlPrefix}/${file}`,
      size,
    };
  }

  return manifest;
}

// Scan source directory for island source files (.tsx/.ts)
export function scanIslandSources(sourceDir: string): string[] {
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir)
    .filter(f => f.endsWith(".tsx") || (f.endsWith(".ts") && !f.endsWith(".d.ts")))
    .map(f => join(sourceDir, f));
}
