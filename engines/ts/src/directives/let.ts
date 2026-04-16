// PRESTO-TS v3 — Stage 9: htx:let binding
// <htx:let name="value" /> → injects into data context

import type { DataContext } from "../types";

const LET_RE = /<htx:let\s+([a-zA-Z_]\w*)\s*=\s*"([^"]*)"\s*\/>/g;

export function resolveLet(content: string, data: DataContext): string {
  return content.replace(LET_RE, (_match, name: string, value: string) => {
    data[name] = value;
    return "";
  });
}
