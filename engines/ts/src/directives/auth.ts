// PRESTO-TS v3 — Stage 13: htx:auth / htx:unauth conditional rendering

import type { DataContext } from "../types";

const AUTH_RE = /<htx:auth(?:\s+role="([^"]*)")?\s*>([\s\S]*?)<\/htx:auth>/g;
const UNAUTH_RE = /<htx:unauth\s*>([\s\S]*?)<\/htx:unauth>/g;

export function resolveAuth(content: string, data: DataContext): string {
  const auth = data.auth as { user?: { role?: string } } | null | undefined;
  const isAuthenticated = !!(auth && auth.user);
  const userRole = isAuthenticated ? auth!.user!.role : undefined;

  // htx:auth — show content if authenticated (optionally with role match)
  let result = content.replace(AUTH_RE, (_match, role: string | undefined, body: string) => {
    if (!isAuthenticated) return "";
    if (role && userRole !== role) return "";
    return body;
  });

  // htx:unauth — show content if NOT authenticated
  result = result.replace(UNAUTH_RE, (_match, body: string) => {
    return isAuthenticated ? "" : body;
  });

  return result;
}
