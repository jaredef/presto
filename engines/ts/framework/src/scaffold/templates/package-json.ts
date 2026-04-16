import type { ScaffoldOptions } from "../scaffold";

export function generatePackageJson(options: ScaffoldOptions): string {
  return JSON.stringify({
    name: options.name,
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "bun --watch server.ts",
      start: "bun server.ts",
    },
  }, null, 2) + "\n";
}
