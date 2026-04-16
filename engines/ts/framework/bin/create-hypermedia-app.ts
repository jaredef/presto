#!/usr/bin/env bun
// create-hypermedia-app — Scaffold a Hypermedia App project
// Usage: bun framework/bin/create-hypermedia-app.ts my-app
//        bun framework/bin/create-hypermedia-app.ts my-app --auth --examples

import { scaffoldProject } from "../src/scaffold/scaffold";
import { join } from "node:path";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith("--"));
const positional = args.filter(a => !a.startsWith("--"));

const name = positional[0];

if (!name) {
  console.log("\n  create-hypermedia-app — Scaffold a Hypermedia App project\n");
  console.log("  Usage:");
  console.log("    bun create-hypermedia-app <project-name> [options]\n");
  console.log("  Options:");
  console.log("    --auth       Include authentication (login, register, sessions)");
  console.log("    --examples   Include example blog pages with seeded data");
  console.log("    --all        Include both auth and examples\n");
  console.log("  Example:");
  console.log("    bun create-hypermedia-app my-app --all\n");
  process.exit(0);
}

const targetDir = join(process.cwd(), name);

if (existsSync(targetDir)) {
  console.error(`\n  Error: Directory "${name}" already exists.\n`);
  process.exit(1);
}

const options = {
  name,
  auth: flags.includes("--auth") || flags.includes("--all"),
  examples: flags.includes("--examples") || flags.includes("--all"),
};

console.log(`\n  Creating ${name}...\n`);

scaffoldProject(targetDir, options);

console.log(`  Project structure:`);
console.log(`    ${name}/`);
console.log(`      app/pages/       — your page templates`);
console.log(`      app/components/  — reusable components`);
console.log(`      app/public/      — static assets (CSS, JS, images)`);
console.log(`      app/data/        — SQLite database`);
console.log(`      config.ts        — app configuration`);
console.log(`      server.ts        — entry point\n`);

if (options.auth) console.log(`    + Auth pages (login, register)`);
if (options.examples) console.log(`    + Example blog with seeded posts`);

console.log(`\n  Next steps:\n`);
console.log(`    cd ${name}`);
console.log(`    bun run dev\n`);
