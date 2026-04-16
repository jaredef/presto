#!/usr/bin/env bun
// hypermedia — Development CLI for Hypermedia App projects
// Usage: hypermedia dev
//        hypermedia generate crud post title:text body:text status:text
//        hypermedia seed <type>

import { parseCrudArgs, generateCrud, generateSchema, generateSeed } from "../src/generate/crud-generator";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "dev": {
    // Import config and start dev server
    const configPath = resolve(process.cwd(), "config.ts");
    if (!existsSync(configPath)) {
      console.error("\n  Error: config.ts not found. Are you in a Hypermedia App project?\n");
      process.exit(1);
    }
    const { default: config } = await import(configPath);
    const { defaultConfig } = await import("../src/config");
    const { startDevServer } = await import("../src/dev/dev-server");
    startDevServer(defaultConfig(config));
    break;
  }

  case "generate": {
    const [subCmd, ...genArgs] = args;
    if (subCmd === "crud") {
      const parsed = parseCrudArgs(genArgs);
      if (!parsed) {
        console.log("\n  Usage: hypermedia generate crud <name> <field:type> [field:type...]\n");
        console.log("  Field types: text, number, bool\n");
        console.log("  Example:");
        console.log("    hypermedia generate crud post title:text body:text status:text\n");
        break;
      }

      const pagesDir = resolve(process.cwd(), "app/pages");
      if (!existsSync(pagesDir)) {
        console.error("\n  Error: app/pages not found. Are you in a Hypermedia App project?\n");
        process.exit(1);
      }

      console.log(`\n  Generating CRUD pages for "${parsed.name}"...\n`);
      const created = generateCrud(pagesDir, parsed.name, parsed.fields);
      for (const file of created) {
        console.log(`    + app/pages/${file}`);
      }

      // Generate schema SQL
      const schema = generateSchema(parsed.name, [{ name: "slug", type: "text" }, ...parsed.fields]);
      console.log(`\n  Schema (run in your database):\n`);
      console.log(`    ${schema.replace(/\n/g, "\n    ")}\n`);

      // Generate seed SQL
      const seed = generateSeed(parsed.name, [{ name: "slug", type: "text" }, ...parsed.fields]);
      console.log(`  Seed data:\n`);
      console.log(`    ${seed.replace(/\n/g, "\n    ")}\n`);

      console.log(`  ${created.length} pages generated. Add the schema to your database to start using them.\n`);
    } else {
      console.log("\n  Available generators:");
      console.log("    crud    Generate list, detail, create, edit, delete pages\n");
    }
    break;
  }

  default: {
    console.log("\n  hypermedia — Development CLI for Hypermedia App\n");
    console.log("  Commands:");
    console.log("    dev                           Start dev server with hot reload");
    console.log("    generate crud <name> <fields>  Generate CRUD pages\n");
    console.log("  Examples:");
    console.log("    hypermedia dev");
    console.log("    hypermedia generate crud post title:text body:text status:text\n");
  }
}
