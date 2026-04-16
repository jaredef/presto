import type { ScaffoldOptions } from "../scaffold";

export function generateServer(options: ScaffoldOptions): string {
  return `// ${options.name} — Server Entry Point
// This is a thin wrapper. The engine does the work.
// Escape: copy this file's internals and modify directly.

import config from "./config";

// Import the framework's createServer
// In production, this would be: import { createServer } from "hypermedia-app"
const { createServer } = await import("${getFrameworkPath()}/framework/src/server");

createServer(config);
`;
}

function getFrameworkPath(): string {
  // Resolve to the presto-ts root relative to the generated project
  return process.env.PRESTO_TS_PATH || "/home/jaredef/presto-ts";
}
