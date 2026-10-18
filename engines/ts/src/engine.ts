// PRESTO-TS v3 — Engine
// Orchestrates routing, pipeline, mutations, channels, static serving

import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { Router } from "./router";
import { executePipeline } from "./pipeline";
import { EngineRegistry } from "./modules/registry";
import { executeMiddleware } from "./modules/middleware";
import { ActionTokenService, ChannelTokenService } from "./security/tokens";
import type { EngineConfig, HtxRequest, HtxResponse, DataContext, PipelineContext, RouteMatch } from "./types";
import { HtxResponse as HtxResp, NotFound } from "./types";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

// Derive a fingerprint from request context for bearer forwarding protection.
// Uses User-Agent + Accept-Language + IP prefix (first 3 octets for NAT tolerance).
// The fingerprint is a simple hash — not cryptographic identity, but sufficient
// to detect cross-context token forwarding.
function computeFingerprint(request: HtxRequest): string {
  const ua = request.headers["user-agent"] || "";
  const lang = request.headers["accept-language"] || "";
  const ip = (request.headers["x-forwarded-for"] || request.headers["x-real-ip"] || "").split(",")[0].trim();
  const ipPrefix = ip.split(".").slice(0, 3).join(".");
  const raw = `${ua}|${lang}|${ipPrefix}`;
  // Simple hash — not for security, just for binding
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

export class PrestoEngine {
  private router: Router;
  private registry: EngineRegistry;
  private config: EngineConfig;

  constructor(config: EngineConfig) {
    this.config = config;
    this.router = new Router(config.templateDir);
    this.registry = new EngineRegistry();
    if (config.modules) {
      this.registry.bootModules(config.modules);
    }
  }

  async handle(request: HtxRequest): Promise<HtxResp> {
    try {
      // Stage 1: Static file serving
      const staticResp = this.serveStatic(request.path);
      if (staticResp) return staticResp;

      // Stage 2: Channel API
      if (request.path.startsWith("/api/channel/")) {
        return await this.handleChannel(request);
      }

      // POST: mutation execution (C4: does NOT execute template pipeline)
      if (request.method === "POST") {
        return await this.handleMutation(request);
      }

      // Stage 3: Middleware chain execution (pre-pipeline pass)
      // Middleware can short-circuit (return early) or mutate the request.
      // We run the chain with a continue-marker final handler.
      // After the pipeline, we run middleware again as a post-pass for response headers.
      let middlewareShortCircuit: HtxResp | null = null;
      if (this.registry.middleware.length > 0) {
        const result = executeMiddleware(
          this.registry.middleware,
          request,
          () => new HtxResp(200, "text/html", "__PIPELINE_CONTINUE__"),
        );
        if (typeof result.body !== "string" || !result.body.includes("__PIPELINE_CONTINUE__")) {
          // Middleware short-circuited — return its response directly
          return result;
        }
        // Store any headers middleware added for later merge
        middlewareShortCircuit = result;
      }

      // Route to template
      const match = this.router.resolve(request.path);
      if (!match) return await this.notFound(request);

      const finalResp = await this.render(request, match);

      // Merge middleware-added headers onto the final response
      if (middlewareShortCircuit) {
        for (const [key, value] of Object.entries(middlewareShortCircuit.headers)) {
          if (key !== "Content-Type") finalResp.headers[key] = value;
        }
      }

      return finalResp;
    } catch (err) {
      if (err instanceof NotFound) return await this.notFound(request);
      console.error("Pipeline error:", err);
      return HtxResp.html("<h1>500 Internal Server Error</h1>", 500);
    }
  }

  // Resolve a template into a response. The body depends on HX-Request (root layout skip)
  // and HX-Target (fragments), so both are declared in Vary (K6).
  private async render(request: HtxRequest, match: RouteMatch, status = 200): Promise<HtxResp> {
    const data: DataContext = {
      params: match.params,
      query: request.query,
      auth: request.auth,
      request: {
        method: request.method,
        path: request.path,
      },
      $fingerprint: computeFingerprint(request),
    };

    // Stage 4: Context provider injection
    for (const cp of this.registry.contextProviders) {
      try {
        const provided = cp.resolve(request);
        Object.assign(data, provided);
      } catch (err) {
        console.warn(`Context provider ${cp.name()} failed:`, err);
      }
    }

    const templateContent = readFileSync(match.filePath, "utf-8");
    data.__templateContent = templateContent;

    const ctx: PipelineContext = {
      request,
      data,
      filePath: match.filePath,
      templateRoot: this.config.templateDir,
      publicRoot: this.config.publicDir,
      secret: this.config.secret,
      adapter: this.config.adapter,
      scriptCollector: [],
      registry: this.registry,
    };

    const html = await executePipeline(ctx);
    const resp = HtxResp.html(html, status);
    resp.headers.Vary = "HX-Request, HX-Target";
    return resp;
  }

  // F5: the not-found representation is _404.htx when the site has one (K7: never routable
  // itself), else the plain one. A _404.htx that is itself not found falls back too.
  private async notFound(request: HtxRequest): Promise<HtxResp> {
    const filePath = join(this.config.templateDir, "_404.htx");
    if (!existsSync(filePath)) return HtxResp.notFound();
    try {
      return await this.render(request, { filePath, params: {} }, 404);
    } catch (err) {
      if (!(err instanceof NotFound)) console.error("Pipeline error:", err);
      return HtxResp.notFound();
    }
  }

  private serveStatic(urlPath: string): HtxResp | null {
    // Strip leading slash, check in public dir
    const relPath = urlPath.replace(/^\//, "");
    const filePath = join(this.config.publicDir, relPath);

    if (!existsSync(filePath)) return null;

    // Verify it's under public dir (security)
    const resolved = require("node:path").resolve(filePath);
    const publicResolved = require("node:path").resolve(this.config.publicDir);
    if (!resolved.startsWith(publicResolved)) return null;

    try {
      // Keep the raw bytes: decoding to a string corrupts binary files (images, fonts, wasm).
      const content = new Uint8Array(readFileSync(filePath));
      const ext = extname(filePath).toLowerCase();
      const mime = MIME_TYPES[ext] || "application/octet-stream";
      return new HtxResp(200, mime, content);
    } catch {
      return null;
    }
  }

  private async handleChannel(request: HtxRequest): Promise<HtxResp> {
    // Parse /api/channel/{module}/{path}
    const parts = request.path.replace("/api/channel/", "").split("/");
    const moduleName = parts[0];
    const subPath = parts.slice(1).join("/");

    const handler = this.registry.channelHandlers.get(moduleName);
    if (!handler) {
      return HtxResp.json({ error: "Channel handler not found" }, 404);
    }

    // Validate Bearer token
    const authHeader = request.headers.authorization || request.headers.Authorization || "";
    const token = authHeader.replace(/^Bearer\s+/, "");
    if (!token) {
      return HtxResp.json({ error: "Unauthorized" }, 401);
    }

    const channelService = new ChannelTokenService(this.config.secret);
    const verified = await channelService.verify(token);
    if (!verified) {
      return HtxResp.json({ error: "Invalid token" }, 401);
    }

    // Check scope
    const expectedScope = `channel:${moduleName}`;
    if (verified.scope !== expectedScope) {
      return HtxResp.json({ error: "Forbidden: scope mismatch" }, 403);
    }

    // Route to handler
    try {
      const result = handler.handle(subPath, request.query, verified.sub, {
        method: request.method,
        body: request.body,
      });
      return HtxResp.json(result.data, result.status);
    } catch (err) {
      return HtxResp.json({ error: "Channel handler error" }, 500);
    }
  }

  private async handleMutation(request: HtxRequest): Promise<HtxResp> {
    const actionToken = (request.body._action_token as string) || "";
    if (!actionToken) {
      return HtxResp.json({ error: "Missing action token" }, 400);
    }

    const service = new ActionTokenService(this.config.secret);

    // Build fingerprint from request context for bearer forwarding protection
    const fp = computeFingerprint(request);

    const verified = await service.verify(actionToken, {
      sub: request.auth?.user?.id,
      fingerprint: fp,
    });
    if (!verified) {
      return HtxResp.json({ error: "Invalid or expired action token" }, 403);
    }

    const { action, type, recordId } = verified;

    // Strip internal fields from body before passing to adapter
    const { _action_token, ...data } = request.body as Record<string, unknown>;

    try {
      switch (action) {
        case "create": {
          const record = this.config.adapter.create(type, data);
          return HtxResp.json({ success: true, record }, 201);
        }
        case "update": {
          const success = this.config.adapter.update(type, recordId, data);
          return HtxResp.json({ success }, success ? 200 : 404);
        }
        case "delete": {
          const success = this.config.adapter.delete(type, recordId);
          return HtxResp.json({ success }, success ? 200 : 404);
        }
        default:
          return HtxResp.json({ error: `Unknown action: ${action}` }, 400);
      }
    } catch (err) {
      return HtxResp.json({ error: "Mutation failed" }, 500);
    }
  }
}
