// PRESTO-TS v3 — Core Types
// Derived from PRESTO Seed v7

// === Request / Response ===

export interface HtxRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  body: Record<string, unknown>;
  bodyRaw: string;
  contentType: string;
  hxRequest: boolean;
  auth: { user: { id: string; name: string; role?: string } } | null;
}

export class HtxResponse {
  constructor(
    public status: number,
    public contentType: string,
    // Bytes for static files (images, fonts, wasm); text for rendered HTML/JSON.
    public body: string | Uint8Array,
    public headers: Record<string, string> = {},
  ) {}

  static html(body: string, status = 200): HtxResponse {
    return new HtxResponse(status, "text/html; charset=utf-8", body);
  }

  static json(data: unknown, status = 200): HtxResponse {
    return new HtxResponse(status, "application/json", JSON.stringify(data));
  }

  static notFound(): HtxResponse {
    return HtxResponse.html("<h1>404 Not Found</h1>", 404);
  }

  static redirect(url: string, status = 302): HtxResponse {
    return new HtxResponse(status, "text/html", "", { Location: url });
  }

  setCookie(name: string, value: string, options: CookieOptions = {}): this {
    const parts = [`${name}=${value}`];
    if (options.path) parts.push(`Path=${options.path}`);
    if (options.httpOnly) parts.push("HttpOnly");
    if (options.secure) parts.push("Secure");
    if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
    if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
    this.headers["Set-Cookie"] = parts.join("; ");
    return this;
  }
}

export interface CookieOptions {
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  maxAge?: number;
}

// === Routing ===

export interface RouteMatch {
  filePath: string;
  params: Record<string, string>;
}

// === Data Context ===

export type DataContext = Record<string, unknown>;

// === Content Adapter ===

export interface ContentRecord {
  id: number | string;
  [key: string]: unknown;
}

export interface ContentAdapter {
  query(options: {
    type: string;
    where?: string;
    order?: string;
    limit?: number;
    offset?: number;
  }): ContentRecord[];

  get(type: string, identifier: string | number): ContentRecord | null;
  create(type: string, data: Record<string, unknown>): ContentRecord;
  update(type: string, id: string | number, data: Record<string, unknown>): boolean;
  delete(type: string, id: string | number): boolean;
}

// === Module System ===

export interface ModuleManifest {
  trust: "first-party" | "restricted";
  contextProviders?: string[];
  channelHandlers?: string[];
  middleware?: string[];
}

export interface HtxModule {
  name(): string;
  manifest(): ModuleManifest;
  boot(registry: ModuleRegistry): void;
}

export interface ModuleRegistry {
  registerMiddleware(mw: Middleware): void;
  registerContextProvider(cp: ContextProvider): void;
  registerChannelHandler(ch: ChannelHandler): void;
  registerTemplateProcessor(phase: "pre" | "post", tp: TemplateProcessor): void;
}

export interface Middleware {
  name(): string;
  handle(request: HtxRequest, next: () => HtxResponse): HtxResponse;
}

export interface ContextProvider {
  name(): string;
  resolve(request: HtxRequest): Record<string, unknown>;
}

export interface ChannelHandler {
  module(): string;
  handle(
    subPath: string,
    query: Record<string, string>,
    userId: string,
    options: { method: string; body: Record<string, unknown> },
  ): { status: number; data: unknown };
}

export interface TemplateProcessor {
  name(): string;
  process(content: string, context: DataContext): string;
}

// === Pipeline ===

export interface PipelineContext {
  request: HtxRequest;
  data: DataContext;
  filePath: string;
  templateRoot: string;
  publicRoot: string;
  secret: string;
  adapter: ContentAdapter;
  scriptCollector: string[];
  registry: ResolvedRegistry;
}

export interface ResolvedRegistry {
  middleware: Middleware[];
  contextProviders: ContextProvider[];
  channelHandlers: Map<string, ChannelHandler>;
  preProcessors: TemplateProcessor[];
  postProcessors: TemplateProcessor[];
}

// === Engine Config ===

export interface EngineConfig {
  templateDir: string;
  publicDir: string;
  secret: string;
  adapter: ContentAdapter;
  modules?: HtxModule[];
  maxIncludeDepth?: number;
}
