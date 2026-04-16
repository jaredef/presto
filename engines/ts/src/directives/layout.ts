// PRESTO-TS v3 — Layout system
// Stage 15b: Extract layout directive AFTER expression eval
// Stage 18: Layout wrapping (convention _layout.htx walk or directive override)

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const LAYOUT_RE = /<htx:layout(?:\s+(?:src\s*=\s*"([^"]*)"|(none)))?\s*(?:\/>|><\/htx:layout>)/i;

export interface LayoutDirective {
  src?: string;
  none?: boolean;
}

export function extractLayoutDirective(content: string): { directive: LayoutDirective | null; content: string } {
  const match = LAYOUT_RE.exec(content);
  if (!match) return { directive: null, content };

  const directive: LayoutDirective = {};
  if (match[1]) directive.src = match[1];
  if (match[2]) directive.none = true;

  // Remove the directive from content
  const cleaned = content.replace(match[0], "");
  return { directive, content: cleaned };
}

export function wrapLayout(
  content: string,
  filePath: string,
  templateRoot: string,
  directive: LayoutDirective | null,
  hxRequest: boolean,
): string {
  // htx:layout none = no wrapping
  if (directive?.none) return content;

  // htx:layout src = explicit layout file
  if (directive?.src) {
    const layoutPath = resolve(templateRoot, directive.src.replace(/^\//, ""));
    if (existsSync(layoutPath)) {
      const layout = readFileSync(layoutPath, "utf-8");
      return layout.replace("__content__", content);
    }
    return content;
  }

  // Convention: walk from file directory to template root collecting _layout.htx files
  const layouts = collectLayouts(filePath, templateRoot);

  if (layouts.length === 0) return content;

  // HX-Request skips root layout (outermost)
  const toApply = hxRequest ? layouts.slice(0, -1) : layouts;

  let result = content;
  for (const layoutPath of toApply) {
    const layout = readFileSync(layoutPath, "utf-8");
    // Stop at doctype (don't nest doctypes)
    if (result.includes("<!DOCTYPE") && layout.includes("<!DOCTYPE")) {
      continue;
    }
    result = layout.replace("__content__", result);
  }

  return result;
}

function collectLayouts(filePath: string, templateRoot: string): string[] {
  const layouts: string[] = [];
  const normalizedRoot = resolve(templateRoot);
  let dir = dirname(resolve(filePath));

  while (dir.startsWith(normalizedRoot)) {
    const layoutFile = join(dir, "_layout.htx");
    if (existsSync(layoutFile)) {
      layouts.push(layoutFile);
    }

    if (dir === normalizedRoot) break;
    dir = dirname(dir);
  }

  return layouts;
}
