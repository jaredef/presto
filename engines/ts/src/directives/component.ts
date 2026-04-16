// PRESTO-TS v3 — Stage 7: htx:component resolution
// Props, slots, script extraction with IIFE + data-htx-id

import { readFileSync, existsSync } from "node:fs";
import { PathGuard } from "../security/path-guard";

const COMPONENT_RE = /<htx:component\s+src\s*=\s*"([^"]+)"([^>]*)(?:\/>|>([\s\S]*?)<\/htx:component>)/g;
const PROPS_RE = /<htx:props>([\s\S]*?)<\/htx:props>/;
const SLOT_RE = /<htx:slot\s*\/>/g;
const SCRIPT_RE = /<htx:script>([\s\S]*?)<\/htx:script>/g;
const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;
const PROP_LINE_RE = /^\s*(\w+)\s*=\s*"([^"]*)"\s*$/;

export class ComponentResolver {
  constructor(
    private pathGuard: PathGuard,
    private templateRoot: string,
    private maxDepth: number = 10,
  ) {}

  resolve(content: string, currentFile: string, scriptCollector: string[], depth = 0, visited = new Set<string>()): string {
    if (depth > this.maxDepth) {
      return content.replace(COMPONENT_RE, "<!-- htx:component max depth exceeded -->");
    }

    return content.replace(COMPONENT_RE, (_match, src: string, attrsStr: string, slotContent: string | undefined) => {
      const result = this.pathGuard.resolveTemplatePath(src, currentFile);
      if (!result.valid) {
        return `<!-- htx:component path error: ${result.error} -->`;
      }

      const filePath = result.resolved;

      if (visited.has(filePath)) {
        return `<!-- htx:component circular reference: ${src} -->`;
      }

      if (!existsSync(filePath)) {
        return `<!-- htx:component not found: ${src} -->`;
      }

      try {
        let template = readFileSync(filePath, "utf-8");

        // Parse htx:props defaults
        const defaults = this.parseProps(template);
        template = template.replace(PROPS_RE, "");

        // Parse passed attributes
        const passed = this.parseAttrs(attrsStr || "");

        // Merge: passed overrides defaults
        const props = { ...defaults, ...passed };

        // Replace {{ propName }} with values
        for (const [key, value] of Object.entries(props)) {
          template = template.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), value);
        }

        // Inject slot content at <htx:slot />
        template = template.replace(SLOT_RE, slotContent || "");

        // Extract htx:script bodies, wrap in IIFE with data-htx-id
        const htxId = crypto.randomUUID();
        template = template.replace(SCRIPT_RE, (_m, scriptBody: string) => {
          const iife = `(function(){var el=document.querySelector('[data-htx-id="${htxId}"]');${scriptBody.trim()}})();`;
          scriptCollector.push(iife);
          return "";
        });

        // Add data-htx-id to the outermost element
        template = this.addHtxId(template.trim(), htxId);

        // Recurse for nested components
        visited.add(filePath);
        const resolved = this.resolve(template, filePath, scriptCollector, depth + 1, visited);
        visited.delete(filePath);

        return resolved;
      } catch {
        return `<!-- htx:component error: ${src} -->`;
      }
    });
  }

  private parseProps(template: string): Record<string, string> {
    const match = PROPS_RE.exec(template);
    if (!match) return {};

    const props: Record<string, string> = {};
    const lines = match[1].split("\n");
    for (const line of lines) {
      const m = PROP_LINE_RE.exec(line);
      if (m) props[m[1]] = m[2];
    }
    return props;
  }

  private parseAttrs(attrsStr: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    let m;
    const re = new RegExp(ATTR_RE.source, "g");
    while ((m = re.exec(attrsStr)) !== null) {
      attrs[m[1]] = m[2];
    }
    return attrs;
  }

  private addHtxId(html: string, id: string): string {
    // Add data-htx-id to the first HTML element
    const tagMatch = html.match(/^<(\w+)([^>]*?)>/);
    if (tagMatch) {
      const [fullTag, tagName, attrs] = tagMatch;
      return html.replace(fullTag, `<${tagName}${attrs} data-htx-id="${id}">`);
    }
    return `<div data-htx-id="${id}">${html}</div>`;
  }
}
