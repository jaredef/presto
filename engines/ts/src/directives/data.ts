// PRESTO-TS v3 — Stage 10: htx:data resolution
// Queries content adapter, injects results into data context

import type { ContentAdapter, DataContext } from "../types";

const DATA_RE = /<htx:data\s+([^>]*)\/>/g;
const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;
const EXPR_RE = /\{htx:([^}]+)\}/g;

export function resolveData(content: string, data: DataContext, adapter: ContentAdapter): string {
  return content.replace(DATA_RE, (_match, attrsStr: string) => {
    const attrs = parseAttrs(attrsStr);

    // Resolve {htx:} expressions within attribute values (e.g., slug lookups)
    for (const [key, value] of Object.entries(attrs)) {
      attrs[key] = value.replace(EXPR_RE, (_m, path: string) => {
        return resolveContextPath(path.trim(), data);
      });
    }

    const asName = attrs.as;
    if (!asName) return "";

    const type = attrs.type;
    if (!type) return "";

    try {
      if (attrs.where && isSlugLookup(attrs.where)) {
        // Single record lookup via slug
        const slug = extractSlugValue(attrs.where);
        const record = adapter.get(type, slug);
        data[asName] = record ? [record] : [];
      } else {
        // List query
        const results = adapter.query({
          type,
          where: attrs.where,
          order: attrs.order,
          limit: attrs.limit ? parseInt(attrs.limit, 10) : undefined,
          offset: attrs.offset ? parseInt(attrs.offset, 10) : undefined,
        });
        data[asName] = results;
      }
    } catch {
      data[asName] = [];
    }

    return ""; // Strip the directive
  });
}

function parseAttrs(str: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let m;
  const re = new RegExp(ATTR_RE.source, "g");
  while ((m = re.exec(str)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function resolveContextPath(path: string, data: DataContext): string {
  const keys = path.split(".");
  let current: unknown = data;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[key];
  }
  return current != null ? String(current) : "";
}

function isSlugLookup(where: string): boolean {
  return /slug\s*=\s*'[^']*'/.test(where);
}

function extractSlugValue(where: string): string {
  const m = where.match(/slug\s*=\s*'([^']*)'/);
  return m ? m[1] : "";
}
