/**
 * Real-time module for PRESTO v2.
 *
 * WebSocket ceremony: authenticate → deliver topologies → close (ephemeral).
 * Topology delivery: HTTP, SSE, or WebSocket transport.
 * Topology compilation: .tsx/.ts/.js files compiled at boot via Bun.Transpiler.
 */

import { existsSync, readFileSync, readdirSync, watch } from "node:fs";
import path from "node:path";
import type { ServerWebSocket } from "bun";
import { ChannelTokenService } from "./security/tokens";

// ── Topology Compilation ──

const JSX_PRAGMA = "/** @jsxRuntime classic */\n/** @jsx h */\n";

export interface RealtimeOptions {
  topologiesDir: string;
  secret?: string;
  hmr?: boolean;
}

export class RealtimeEngine {
  private topologies: Map<string, string> = new Map();
  private tsTranspiler = new Bun.Transpiler({ loader: "ts", target: "browser" });
  private tsxTranspiler = new Bun.Transpiler({ loader: "tsx", target: "browser" });
  private channelTokens: ChannelTokenService;
  private topologiesDir: string;

  constructor(options: RealtimeOptions) {
    this.topologiesDir = options.topologiesDir;
    this.channelTokens = new ChannelTokenService(options.secret || "");
    this.loadTopologies();
    if (options.hmr) this.watchTopologies();
  }

  private loadTopologies(): void {
    if (!existsSync(this.topologiesDir)) return;

    for (const file of readdirSync(this.topologiesDir)) {
      const isJs = file.endsWith(".js");
      const isTsx = file.endsWith(".tsx");
      const isTs = !isTsx && file.endsWith(".ts") && !file.endsWith(".d.ts");
      if (!isJs && !isTs && !isTsx) continue;

      const name = file.replace(/\.(js|tsx?|ts)$/, "");
      const source = readFileSync(path.join(this.topologiesDir, file), "utf-8");

      try {
        if (isTsx) {
          this.topologies.set(name, this.tsxTranspiler.transformSync(JSX_PRAGMA + source));
          console.log(`[Topology] ${name} (${this.topologies.get(name)!.length} chars, TSX)`);
        } else if (isTs) {
          this.topologies.set(name, this.tsTranspiler.transformSync(source));
          console.log(`[Topology] ${name} (${this.topologies.get(name)!.length} chars, TS)`);
        } else {
          this.topologies.set(name, source);
          console.log(`[Topology] ${name} (${source.length} chars, JS)`);
        }
      } catch (err) {
        console.error(`[Topology] Error in ${file}:`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  private watchTopologies(): void {
    if (!existsSync(this.topologiesDir)) return;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    watch(this.topologiesDir, (_event, filename) => {
      if (!filename) return;
      const isJs = filename.endsWith(".js");
      const isTsx = filename.endsWith(".tsx");
      const isTs = !isTsx && filename.endsWith(".ts") && !filename.endsWith(".d.ts");
      if (!isJs && !isTs && !isTsx) return;

      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        const filePath = path.join(this.topologiesDir, filename);
        if (!existsSync(filePath)) return;
        const name = filename.replace(/\.(js|tsx?|ts)$/, "");
        const source = readFileSync(filePath, "utf-8");

        try {
          if (isTsx) {
            this.topologies.set(name, this.tsxTranspiler.transformSync(JSX_PRAGMA + source));
          } else if (isTs) {
            this.topologies.set(name, this.tsTranspiler.transformSync(source));
          } else {
            this.topologies.set(name, source);
          }
          console.log(`[HMR] ${name} reloaded`);
        } catch (err) {
          console.error(`[HMR] Error in ${filename}:`, err instanceof Error ? err.message : String(err));
        }
      }, 100);
    });

    console.log(`[HMR] Watching ${this.topologiesDir}`);
  }

  // ── Topology Delivery ──

  getTopology(name: string): string | undefined {
    return this.topologies.get(name);
  }

  async deliverTopologyHttp(name: string, userId: string): Promise<Response> {
    const code = this.topologies.get(name);
    if (!code) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "content-type": "application/json" } });

    const token = await this.channelTokens.issue(userId, `channel:${name}`);
    return new Response(JSON.stringify({ type: "topology", name, code, channelToken: token }), {
      headers: { "content-type": "application/json" },
    });
  }

  async deliverTopologyWs(name: string, userId: string, ws: ServerWebSocket<any>): Promise<void> {
    const code = this.topologies.get(name);
    if (!code) {
      ws.send(JSON.stringify({ type: "error", message: `Unknown topology: ${name}` }));
      return;
    }

    const token = await this.channelTokens.issue(userId, `channel:${name}`);
    ws.send(JSON.stringify({ type: "topology", name, code, channelToken: token }));
  }

  // ── WebSocket Message Handler ──

  async handleMessage(ws: ServerWebSocket<any>, message: string, userId: string): Promise<boolean> {
    try {
      const msg = JSON.parse(message);
      if (msg.type === "request_topology" && msg.name) {
        await this.deliverTopologyWs(msg.name, userId, ws);
        return true;
      }
    } catch {}
    return false;
  }

  // ── Accessors ──

  getChannelTokenService(): ChannelTokenService {
    return this.channelTokens;
  }

  getTopologyNames(): string[] {
    return Array.from(this.topologies.keys());
  }
}
