// Hypermedia App — Dev Server
// Watches template files, bumps version for hot reload, logs requests.
// Uses Bun's native file watcher.

import { watch } from "node:fs";
import { resolve } from "node:path";
import type { HypermediaAppConfig } from "../config";
import { createServer } from "../server";
import { LoggerMiddleware } from "./logger";
import { HotReloadProcessor, bumpDevVersion, getDevVersion } from "./hot-reload";
import type { HtxModule, ModuleManifest, ModuleRegistry } from "../../../src/types";

export function startDevServer(config: HypermediaAppConfig) {
  // Add dev modules
  const devModule: HtxModule = {
    name: () => "dev-tools",
    manifest: (): ModuleManifest => ({
      trust: "first-party",
      middleware: ["dev-logger"],
    }),
    boot: (registry: ModuleRegistry) => {
      if (config.dev.logging) {
        registry.registerMiddleware(new LoggerMiddleware());
      }
      if (config.dev.hotReload) {
        registry.registerTemplateProcessor("post", new HotReloadProcessor());
      }
    },
  };

  const devConfig = {
    ...config,
    modules: [...config.modules, devModule],
  };

  const { server, engine } = createServer(devConfig);

  // Watch directories for changes
  const watchDirs = [
    resolve(process.cwd(), config.templates),
    resolve(process.cwd(), config.components),
  ];

  let debounce: ReturnType<typeof setTimeout> | null = null;

  for (const dir of watchDirs) {
    try {
      watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename || !filename.endsWith(".htx")) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          console.log(`\n  \x1b[36mChanged:\x1b[0m ${filename}`);
          bumpDevVersion();
        }, 150);
      });
    } catch {
      // Directory may not exist yet, that's ok
    }
  }

  console.log(`  \x1b[32mDev mode:\x1b[0m hot reload enabled, watching templates\n`);

  return { server, engine };
}
