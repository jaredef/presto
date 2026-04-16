#!/usr/bin/env bun
// presto-ui CLI — shadcn-style component installer
// Usage: bun cli/index.ts add button card dialog
//        bun cli/index.ts list
//        bun cli/index.ts init

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const CLI_DIR = dirname(new URL(import.meta.url).pathname);
const REGISTRY = JSON.parse(readFileSync(join(CLI_DIR, "registry.json"), "utf-8"));
const SOURCE_ROOT = resolve(CLI_DIR, "..");

// Default config
interface Config {
  templateDir: string;
  publicDir: string;
}

function loadConfig(): Config {
  const configPath = join(process.cwd(), ".presto-ui.json");
  if (existsSync(configPath)) {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  }
  return { templateDir: "templates", publicDir: "public" };
}

function resolveDeps(names: string[], resolved = new Set<string>()): string[] {
  for (const name of names) {
    if (resolved.has(name)) continue;
    const comp = REGISTRY.components[name];
    if (!comp) {
      console.error(`Unknown component: ${name}`);
      continue;
    }
    // Resolve dependencies first
    if (comp.deps.length > 0) {
      resolveDeps(comp.deps, resolved);
    }
    resolved.add(name);
  }
  return Array.from(resolved);
}

function cmdAdd(names: string[]) {
  if (names.length === 0) {
    console.log("Usage: presto add <component> [component...]");
    console.log("Example: presto add button card dialog");
    return;
  }

  const config = loadConfig();
  const all = resolveDeps(names);
  let needsSignals = false;
  let needsCss = false;
  let added = 0;

  for (const name of all) {
    const comp = REGISTRY.components[name];
    const srcPath = join(SOURCE_ROOT, "templates", comp.file);
    const destPath = join(process.cwd(), config.templateDir, comp.file);

    if (!existsSync(srcPath)) {
      console.error(`  Source not found: ${srcPath}`);
      continue;
    }

    mkdirSync(dirname(destPath), { recursive: true });
    copyFileSync(srcPath, destPath);
    console.log(`  + ${comp.file} (Layer ${comp.layer})`);
    added++;

    if (comp.signals) needsSignals = true;
    if (comp.layer >= 2) needsSignals = true;
    needsCss = true;
  }

  // Copy CSS
  if (needsCss) {
    const cssSrc = join(SOURCE_ROOT, REGISTRY.assets.css);
    const cssDest = join(process.cwd(), config.publicDir, "css", "presto-ui.css");
    if (existsSync(cssSrc)) {
      mkdirSync(dirname(cssDest), { recursive: true });
      copyFileSync(cssSrc, cssDest);
      console.log(`  + css/presto-ui.css`);
    }
  }

  // Copy signals if any component needs it
  if (needsSignals) {
    const sigSrc = join(SOURCE_ROOT, REGISTRY.assets.signals);
    const sigDest = join(process.cwd(), config.publicDir, "js", "presto-signals.js");
    if (existsSync(sigSrc)) {
      mkdirSync(dirname(sigDest), { recursive: true });
      copyFileSync(sigSrc, sigDest);
      console.log(`  + js/presto-signals.js`);
    }
  }

  console.log(`\nAdded ${added} component${added !== 1 ? "s" : ""}.`);
}

function cmdList() {
  console.log("\nAvailable components:\n");

  const layers: Record<number, string[]> = {};
  for (const [name, comp] of Object.entries(REGISTRY.components) as [string, any][]) {
    const layer = comp.layer;
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push(name);
  }

  const layerNames: Record<number, string> = {
    0: "Layer 0 — Pure HTML (zero JS)",
    2: "Layer 2 — Scoped Behavior",
    4: "Layer 3-4 — Channel Integration",
  };

  for (const [layer, names] of Object.entries(layers).sort(([a], [b]) => Number(a) - Number(b))) {
    console.log(`  ${layerNames[Number(layer)] || `Layer ${layer}`}`);
    for (const name of (names as string[]).sort()) {
      const comp = REGISTRY.components[name];
      const deps = comp.deps.length > 0 ? ` (requires: ${comp.deps.join(", ")})` : "";
      console.log(`    ${name}${deps}`);
    }
    console.log();
  }
}

function cmdInit() {
  const configPath = join(process.cwd(), ".presto-ui.json");
  if (existsSync(configPath)) {
    console.log(".presto-ui.json already exists.");
    return;
  }

  const config = { templateDir: "templates", publicDir: "public" };
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log("Created .presto-ui.json");
  console.log(`  templateDir: ${config.templateDir}`);
  console.log(`  publicDir: ${config.publicDir}`);
  console.log("\nRun: bun cli/index.ts add button card dialog");
}

// Main
const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "add":
    cmdAdd(args);
    break;
  case "list":
    cmdList();
    break;
  case "init":
    cmdInit();
    break;
  case "build-islands": {
    const { buildIslands } = await import("./build-islands");
    const sourceDir = args[0] || "islands";
    const outDir = args[1] || "public/js/islands";
    console.log(`\n  Building islands from ${sourceDir} → ${outDir}\n`);
    await buildIslands(sourceDir, outDir);
    break;
  }
  default:
    console.log("presto-ui — Component library for the PRESTO architectural style\n");
    console.log("Commands:");
    console.log("  init                        Create .presto-ui.json config");
    console.log("  list                        List available components");
    console.log("  add <names...>              Add components to your project");
    console.log("  build-islands [src] [out]   Bundle React islands");
    console.log("\nExamples:");
    console.log("  bun cli/index.ts add button input card dialog");
    console.log("  bun cli/index.ts add form input textarea select");
    console.log("  bun cli/index.ts add live-feed presence");
}
