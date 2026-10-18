// PRESTO-TS v3 — Stage 10: htx:data resolution
// Queries content adapter, injects results into data context

import { NotFound, type ContentAdapter, type DataContext } from "../types";

const DATA_RE = /<htx:data\s+([^>]*)\/>/g;
const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;
const EXPR_RE = /\{htx:([^}]+)\}/g;
const WHERE_VALUE = /'\{htx:([^}]+)\}'|\{htx:([^}]+)\}/g;
const SLUG_ONLY = /^\s*slug\s*=\s*(?:'\{htx:([^}]+)\}'|'([^']*)'|\{htx:([^}]+)\})\s*$/;

export function resolveData(content: string, data: DataContext, adapter: ContentAdapter): string {
  return content.replace(DATA_RE, (_match, attrsStr: string) => {
    const attrs = parseAttrs(attrsStr);
    // F5: a bare "required" attribute; an empty result means the page does not exist.
    const required = /(^|\s)required(?=\s|\/|$)/.test(attrsStr.replace(/"[^"]*"/g, "\"\""));

    // Values never become grammar (K3, .plans/htxlang-closure-plan.md): each {htx:} in "where",
    // quoted or bare, is lowered to a ? placeholder with the value bound as a parameter.
    // Other attributes (type, order, limit, offset) resolve as before.
    const where = attrs.where;
    delete attrs.where;
    for (const [key, value] of Object.entries(attrs)) {
      attrs[key] = value.replace(EXPR_RE, (_m, path: string) => {
        return resolveContextPath(path.trim(), data);
      });
    }

    const asName = attrs.as;
    if (!asName) return "";

    const type = attrs.type;
    if (!type) return "";

    // The get() shortcut only when the whole where is one slug equality; anything more
    // (AND status = ...) is a query, so no clause is dropped.
    const slug = where !== undefined ? SLUG_ONLY.exec(where) : null;
    if (slug) {
      const path = slug[1] ?? slug[3];
      const value = path !== undefined ? resolveContextPath(path.trim(), data) : slug[2];
      const record = adapter.get(type, value);
      data[asName] = record ? [record] : [];
    } else {
      const params: unknown[] = [];
      const lowered = where?.replace(WHERE_VALUE, (_m, quoted: string | undefined, bare: string | undefined) => {
        params.push(bindValue((quoted ?? bare).trim(), data));
        return "?";
      });
      data[asName] = adapter.query({
        type,
        where: lowered,
        params: params.length ? params : undefined,
        order: attrs.order,
        limit: attrs.limit ? parseInt(attrs.limit, 10) : undefined,
        offset: attrs.offset ? parseInt(attrs.offset, 10) : undefined,
      });
    }

    if (required && (data[asName] as unknown[]).length === 0) {
      throw new NotFound(`htx:data ${asName} is required and has no result`);
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

function bindValue(path: string, data: DataContext): unknown {
  const keys = path.split(".");
  let current: unknown = data;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[key];
  }
  if (current == null) return "";
  return typeof current === "number" || typeof current === "boolean" ? current : String(current);
}
