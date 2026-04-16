// Module Kit — Islands
// Context provider that makes the island manifest available in templates.
// Zero cost for pages that don't use islands.

import type { HtxModule, ModuleManifest, ModuleRegistry, ContextProvider, HtxRequest } from "../src/types";
import { scanIslandBundles, type IslandManifest } from "../src/islands/registry";

export interface IslandModuleOptions {
  bundleDir: string;
  urlPrefix?: string;
}

export function createIslandModule(options: IslandModuleOptions): HtxModule {
  const urlPrefix = options.urlPrefix ?? "/js/islands";

  // Scan once at boot — manifest is static until server restarts
  const manifest = scanIslandBundles(options.bundleDir, urlPrefix);
  const islandCount = Object.keys(manifest.islands).length;

  if (islandCount > 0) {
    console.log(`  Islands: ${islandCount} registered (${Object.keys(manifest.islands).join(", ")})`);
  }

  return {
    name: () => "islands",
    manifest: (): ModuleManifest => ({
      trust: "first-party",
      contextProviders: ["islands"],
    }),
    boot: (registry: ModuleRegistry) => {
      registry.registerContextProvider({
        name: () => "islands",
        resolve(_request: HtxRequest): Record<string, unknown> {
          return { __islands: manifest.islands };
        },
      });
    },
  };
}
