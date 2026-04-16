// test-hypermedia-app — Server Entry Point
// This is a thin wrapper. The engine does the work.
// Escape: copy this file's internals and modify directly.

import config from "./config";

// Import the framework's createServer
// In production, this would be: import { createServer } from "hypermedia-app"
const { createServer } = await import("/home/jaredef/presto-ts/framework/src/server");

createServer(config);
