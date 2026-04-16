// PRESTO-TS v3 — Stage 12: htx:action mutation token preparation
// C4: Generates signed tokens on GET (prepare). POST verifies + executes.
// Tokens carry unified authentication (sub) and authorization (scope),
// with optional fingerprint binding for bearer forwarding protection.

import type { DataContext } from "../types";
import { ActionTokenService } from "../security/tokens";

const ACTION_RE = /<htx:action\s+([^>]*)\/>/g;
const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;
const EXPR_RE = /\{htx:([^}]+)\}/g;

export async function resolveActions(
  content: string,
  data: DataContext,
  secret: string,
): Promise<string> {
  const service = new ActionTokenService(secret);
  const matches = [...content.matchAll(ACTION_RE)];

  // Initialize $actions in data context
  if (!data.$actions) data.$actions = {};
  const actions = data.$actions as Record<string, string>;

  // Extract identity and fingerprint from resolution context
  const auth = data.auth as { user?: { id?: string } } | undefined;
  const sub = auth?.user?.id || "";
  const fingerprint = (data.$fingerprint as string) || "";

  let result = content;

  for (const match of matches) {
    const attrs = parseAttrs(match[1]);

    // Resolve {htx:} expressions in attribute values
    for (const [key, value] of Object.entries(attrs)) {
      attrs[key] = value.replace(EXPR_RE, (_m, path: string) => {
        return resolveContextPath(path.trim(), data);
      });
    }

    const name = attrs.name;
    const type = attrs.type;
    const recordId = attrs.record;
    const ttl = attrs.ttl ? parseInt(attrs.ttl, 10) : undefined;

    if (name && type) {
      const token = await service.issue(name, type, recordId, {
        sub,
        fingerprint,
        ttl,
      });
      actions[name] = token;
    }

    result = result.replace(match[0], "");
  }

  return result;
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
