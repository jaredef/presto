// Module Kit — Security Headers
// Adds security headers to every response. Configurable per header.

import type { HtxModule, ModuleManifest, ModuleRegistry, HtxRequest, HtxResponse } from "../src/types";

export interface SecurityOptions {
  contentTypeOptions?: string;
  frameOptions?: string;
  xssProtection?: string;
  referrerPolicy?: string;
  csp?: string;
  hsts?: { maxAge: number; includeSubDomains?: boolean } | false;
  permissionsPolicy?: string;
}

export function createSecurityModule(options: SecurityOptions = {}): HtxModule {
  const headers: Record<string, string> = {};

  headers["X-Content-Type-Options"] = options.contentTypeOptions ?? "nosniff";
  headers["X-Frame-Options"] = options.frameOptions ?? "DENY";
  headers["X-XSS-Protection"] = options.xssProtection ?? "0";
  headers["Referrer-Policy"] = options.referrerPolicy ?? "strict-origin-when-cross-origin";

  if (options.csp) headers["Content-Security-Policy"] = options.csp;
  if (options.permissionsPolicy) headers["Permissions-Policy"] = options.permissionsPolicy;

  if (options.hsts !== false) {
    const hsts = options.hsts ?? { maxAge: 31536000, includeSubDomains: true };
    headers["Strict-Transport-Security"] = `max-age=${hsts.maxAge}${hsts.includeSubDomains ? "; includeSubDomains" : ""}`;
  }

  return {
    name: () => "security-headers",
    manifest: (): ModuleManifest => ({ trust: "first-party", middleware: ["security-headers"] }),
    boot: (registry: ModuleRegistry) => {
      registry.registerMiddleware({
        name: () => "security-headers",
        handle(_request: HtxRequest, next: () => HtxResponse): HtxResponse {
          const resp = next();
          for (const [key, value] of Object.entries(headers)) {
            resp.headers[key] = value;
          }
          return resp;
        },
      });
    },
  };
}
