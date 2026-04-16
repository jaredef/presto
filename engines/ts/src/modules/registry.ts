// PRESTO-TS v3 — Module Registry with Manifest Sandboxing
// C5: First-party full access. Restricted: undeclared registrations silently dropped.

import type {
  HtxModule,
  ModuleRegistry,
  Middleware,
  ContextProvider,
  ChannelHandler,
  TemplateProcessor,
  ResolvedRegistry,
} from "../types";

export class EngineRegistry implements ResolvedRegistry {
  middleware: Middleware[] = [];
  contextProviders: ContextProvider[] = [];
  channelHandlers = new Map<string, ChannelHandler>();
  preProcessors: TemplateProcessor[] = [];
  postProcessors: TemplateProcessor[] = [];

  bootModules(modules: HtxModule[]): void {
    for (const mod of modules) {
      try {
        const manifest = mod.manifest();
        const registry: ModuleRegistry =
          manifest.trust === "first-party"
            ? this.createRealRegistry()
            : this.createSandboxedRegistry(manifest);

        mod.boot(registry);
      } catch (err) {
        console.warn(`Module ${mod.name()} failed to boot:`, err);
      }
    }
  }

  private createRealRegistry(): ModuleRegistry {
    return {
      registerMiddleware: (mw) => this.middleware.push(mw),
      registerContextProvider: (cp) => this.contextProviders.push(cp),
      registerChannelHandler: (ch) => this.channelHandlers.set(ch.module(), ch),
      registerTemplateProcessor: (phase, tp) => {
        if (phase === "pre") this.preProcessors.push(tp);
        else this.postProcessors.push(tp);
      },
    };
  }

  private createSandboxedRegistry(manifest: { middleware?: string[]; contextProviders?: string[]; channelHandlers?: string[] }): ModuleRegistry {
    return {
      registerMiddleware: (mw) => {
        if (manifest.middleware?.includes(mw.name())) {
          this.middleware.push(mw);
        } else {
          console.warn(`Rejected middleware registration: ${mw.name()} (not declared in manifest)`);
        }
      },
      registerContextProvider: (cp) => {
        if (manifest.contextProviders?.includes(cp.name())) {
          this.contextProviders.push(cp);
        } else {
          console.warn(`Rejected context provider: ${cp.name()} (not declared in manifest)`);
        }
      },
      registerChannelHandler: (ch) => {
        if (manifest.channelHandlers?.includes(ch.module())) {
          this.channelHandlers.set(ch.module(), ch);
        } else {
          console.warn(`Rejected channel handler: ${ch.module()} (not declared in manifest)`);
        }
      },
      registerTemplateProcessor: () => {
        console.warn("Template processors not allowed for restricted modules");
      },
    };
  }
}
