// PRESTO-TS v3 — Stage 9: htx:let binding
// <htx:let name="value" /> → injects into data context
//
// A value may embed {htx:path} expressions. Each resolves once, to a raw string
// (output escaping happens where the value is printed): at stage 9 when the
// path's root is already in the context (params, query, an earlier let), else
// after stage 10 (resolveDeferredLets), so a let can name data the page loads,
// e.g. <htx:let title="{htx:post.0.title} | Blog"/>. Resolved text is never
// rescanned, so a value carrying "{htx:" from a request stays literal.

import { ExpressionEngine } from "../expressions";
import type { DataContext } from "../types";

const LET_RE = /<htx:let\s+([a-zA-Z_]\w*)\s*=\s*"([^"]*)"\s*\/>/g;
const EXPR_RE = /\{htx:([^}]+)\}/g;
const DEFERRED = "__letDeferred";

type Part = string | { path: string };

const expr = new ExpressionEngine();

const rootOf = (path: string) => path.split(/[.|]/)[0].trim();
const show = (path: string, data: DataContext) => expr.valueToString(expr.resolvePath(path.trim(), data));

export function resolveLet(content: string, data: DataContext): string {
  return content.replace(LET_RE, (_match, name: string, value: string) => {
    const parts: Part[] = [];
    let at = 0;
    for (const m of value.matchAll(EXPR_RE)) {
      parts.push(value.slice(at, m.index));
      parts.push(rootOf(m[1]) in data ? show(m[1], data) : { path: m[1] });
      at = m.index! + m[0].length;
    }
    parts.push(value.slice(at));
    if (parts.some((p) => typeof p !== "string")) {
      const deferred = (data[DEFERRED] ??= {}) as Record<string, Part[]>;
      deferred[name] = parts;
    }
    data[name] = parts.map((p) => (typeof p === "string" ? p : "")).join("");
    return "";
  });
}

// After stage 10: fill the expressions that named data loaded by htx:data.
export function resolveDeferredLets(data: DataContext): void {
  const deferred = data[DEFERRED] as Record<string, Part[]> | undefined;
  if (!deferred) return;
  for (const [name, parts] of Object.entries(deferred)) {
    data[name] = parts.map((p) => (typeof p === "string" ? p : show(p.path, data))).join("");
  }
  delete data[DEFERRED];
}
