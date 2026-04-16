// Module Kit — Static Assets
// Cache busting via content hashing. Versioned URL helper for templates.

import type { HtxModule, ModuleManifest, ModuleRegistry, ContextProvider, HtxRequest, HtxResponse } from "../src/types";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface StaticAssetsOptions {
  publicDir: string;
  hashParam?: string;
  maxAge?: number;
}

export function createStaticAssetsModule(options: StaticAssetsOptions): HtxModule {
  const config = {
    publicDir: options.publicDir,
    hashParam: options.hashParam ?? "v",
    maxAge: options.maxAge ?? 86400,
  };

  // Build hash map at boot time
  const hashMap = new Map<string, string>();
  if (existsSync(config.publicDir)) {
    buildHashMap(config.publicDir, config.publicDir, hashMap);
  }

  return {
    name: () => "static-assets",
    manifest: (): ModuleManifest => ({
      trust: "first-party",
      contextProviders: ["static-assets"],
    }),
    boot: (registry: ModuleRegistry) => {
      // Context provider exposes asset() function for versioned URLs
      registry.registerContextProvider({
        name: () => "static-assets",
        resolve(_request: HtxRequest): Record<string, unknown> {
          return {
            asset: (path: string) => {
              const hash = hashMap.get(path);
              if (hash) return `${path}?${config.hashParam}=${hash}`;
              return path;
            },
          };
        },
      });
    },
  };
}

function buildHashMap(dir: string, root: string, map: Map<string, string>) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        buildHashMap(fullPath, root, map);
      } else if (entry.isFile()) {
        try {
          const content = readFileSync(fullPath);
          const hash = Bun.hash(content).toString(16).substring(0, 8);
          const relPath = "/" + relative(root, fullPath);
          map.set(relPath, hash);
        } catch {}
      }
    }
  } catch {}
}
