// Hypermedia App — Project Scaffold
// Generates a complete, bootable project from conventions

import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { generateConfig } from "./templates/config";
import { generateServer } from "./templates/server";
import { generateLayout } from "./templates/layout";
import { generateIndexPage } from "./templates/index-page";
import { generateErrorPages } from "./templates/error-pages";
import { generateAuthPages } from "./templates/auth-pages";
import { generateExamplePages } from "./templates/example-pages";
import { generateAppCss } from "./templates/app-css";
import { generatePackageJson } from "./templates/package-json";

export interface ScaffoldOptions {
  name: string;
  auth: boolean;
  examples: boolean;
}

export function scaffoldProject(targetDir: string, options: ScaffoldOptions): void {
  const root = resolve(targetDir);
  const prestoRoot = resolve(__dirname, "../../../");

  // Create directory structure
  const dirs = [
    "app/pages",
    "app/pages/blog",
    "app/components/ui",
    "app/modules",
    "app/public/css",
    "app/public/js",
    "app/public/img",
    "app/data",
  ];
  for (const dir of dirs) {
    mkdirSync(join(root, dir), { recursive: true });
  }

  // Generate config
  writeFileSync(join(root, "config.ts"), generateConfig(options));

  // Generate server entry point
  writeFileSync(join(root, "server.ts"), generateServer(options));

  // Generate package.json
  writeFileSync(join(root, "package.json"), generatePackageJson(options));

  // Generate layout
  writeFileSync(join(root, "app/pages/_layout.htx"), generateLayout(options));

  // Generate index page
  writeFileSync(join(root, "app/pages/index.htx"), generateIndexPage(options));

  // Generate error pages
  const errorPages = generateErrorPages();
  writeFileSync(join(root, "app/pages/_404.htx"), errorPages.notFound);
  writeFileSync(join(root, "app/pages/_500.htx"), errorPages.error);

  // Generate auth pages
  if (options.auth) {
    const authPages = generateAuthPages();
    writeFileSync(join(root, "app/pages/login.htx"), authPages.login);
    writeFileSync(join(root, "app/pages/register.htx"), authPages.register);
  }

  // Generate example pages
  if (options.examples) {
    const examplePages = generateExamplePages();
    writeFileSync(join(root, "app/pages/blog/index.htx"), examplePages.blogList);
    writeFileSync(join(root, "app/pages/blog/[slug].htx"), examplePages.blogDetail);
    writeFileSync(join(root, "app/pages/about.htx"), examplePages.about);
  }

  // Generate app CSS
  writeFileSync(join(root, "app/public/css/app.css"), generateAppCss());

  // Copy presto-ui components into BOTH components/ and pages/ui/
  // Components in pages/ui/ are accessible via htx:component src="/ui/..."
  // Components in components/ui/ are the developer's editable copies
  const uiComponents = ["button", "input", "textarea", "select", "card", "badge", "form", "alert", "nav", "separator", "pagination"];
  mkdirSync(join(root, "app/pages/ui"), { recursive: true });
  for (const comp of uiComponents) {
    const src = join(prestoRoot, `templates/ui/${comp}.htx`);
    if (existsSync(src)) {
      copyFileSync(src, join(root, `app/components/ui/${comp}.htx`));
      copyFileSync(src, join(root, `app/pages/ui/${comp}.htx`));
    }
  }

  // Copy CSS + signals
  const cssSrc = join(prestoRoot, "public/css/presto-ui.css");
  if (existsSync(cssSrc)) copyFileSync(cssSrc, join(root, "app/public/css/presto-ui.css"));

  const sigSrc = join(prestoRoot, "public/js/presto-signals.js");
  if (existsSync(sigSrc)) copyFileSync(sigSrc, join(root, "app/public/js/presto-signals.js"));

  // Copy .presto-ui.json config
  writeFileSync(join(root, ".presto-ui.json"), JSON.stringify({
    templateDir: "app/components",
    publicDir: "app/public",
  }, null, 2) + "\n");
}
