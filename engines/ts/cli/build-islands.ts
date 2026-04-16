// CLI — Build Islands
// Bundles each island source file into a self-contained JS file.

import { scanIslandSources } from "../src/islands/registry";
import { basename } from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

export async function buildIslands(sourceDir: string, outDir: string): Promise<void> {
  mkdirSync(outDir, { recursive: true });

  const sources = scanIslandSources(sourceDir);
  if (sources.length === 0) {
    console.log("  No island source files found in " + sourceDir);
    return;
  }

  console.log(`  Building ${sources.length} island(s)...\n`);

  const manifest: Record<string, { bundle: string; size: number }> = {};

  for (const source of sources) {
    const name = basename(source).replace(/\.(tsx?|jsx?)$/, "");
    const startTime = performance.now();

    try {
      const result = await Bun.build({
        entrypoints: [source],
        outdir: outDir,
        minify: true,
        target: "browser",
        naming: "[name].js",
      });

      if (!result.success) {
        console.error(`  FAIL  ${name}`);
        for (const log of result.logs) console.error(`    ${log}`);
        continue;
      }

      const outFile = result.outputs[0];
      const elapsed = (performance.now() - startTime).toFixed(0);
      const sizeKB = (outFile.size / 1024).toFixed(0);

      manifest[name] = {
        bundle: `/js/islands/${name}.js`,
        size: outFile.size,
      };

      console.log(`  ${name}.js  ${sizeKB} KB  (${elapsed}ms)`);
    } catch (err) {
      console.error(`  FAIL  ${name}: ${err}`);
    }
  }

  // Write manifest
  const manifestPath = `${outDir}/islands.json`;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n  Manifest: ${manifestPath}`);
  console.log(`  ${Object.keys(manifest).length} island(s) built.\n`);
}
