// PRESTO-TS v3 — 22-Stage Pipeline
// C1/C2: Input HTML + htx: directives → Output pure HTML, no htx: remaining

import type { PipelineContext } from "./types";
import { ExpressionEngine, ValueTable } from "./expressions";
import { markFragments, selectFragment } from "./directives/fragment";
import { IncludeResolver } from "./directives/include";
import { ComponentResolver } from "./directives/component";
import { extractPageScripts, injectScripts, finalizeScripts } from "./directives/script";
import { resolveLet, resolveDeferredLets } from "./directives/let";
import { resolveData } from "./directives/data";
import { resolveGrants } from "./directives/grant";
import { resolveActions } from "./directives/action";
import { resolveAuth } from "./directives/auth";
import { resolveControlFlow } from "./directives/control-flow";
import { extractLayoutDirective, wrapLayout } from "./directives/layout";
import { stripDirectives } from "./directives/strip";
import { stripRawWrappers } from "./directives/strip";
import { stripComments } from "./directives/comments";
import { PathGuard } from "./security/path-guard";

export async function executePipeline(ctx: PipelineContext): Promise<string> {
  const pathGuard = new PathGuard(ctx.templateRoot);
  const exprEngine = new ExpressionEngine();
  const includeResolver = new IncludeResolver(pathGuard, ctx.templateRoot);
  const componentResolver = new ComponentResolver(pathGuard, ctx.templateRoot);

  let content = ctx.data.__templateContent as string;
  const values = new ValueTable();
  values.attach(ctx.data);

  // Stage 5: Pre-layout template processors (module extension hook)
  for (const tp of ctx.registry.preProcessors) {
    content = tp.process(content, ctx.data);
  }

  // Stage 6: htx:include expansion
  content = includeResolver.resolve(content, ctx.filePath);

  // Stage 7: htx:component resolution
  content = componentResolver.resolve(content, ctx.filePath, ctx.scriptCollector);

  // Stage 8: Page-level htx:script extraction
  content = extractPageScripts(content, ctx.scriptCollector);

  // F4: mark htx:fragment regions (after includes and components, so theirs count too)
  content = markFragments(content);

  // Stage 9: htx:let binding
  content = resolveLet(content, ctx.data);

  // Stage 10: htx:data resolution
  content = resolveData(content, ctx.data, ctx.adapter);
  resolveDeferredLets(ctx.data);

  // Stage 11: htx:grant materialization
  content = await resolveGrants(content, ctx.data, ctx.secret);

  // Stage 12: htx:action token preparation
  content = await resolveActions(content, ctx.data, ctx.secret);

  // Stage 13: htx:auth / htx:unauth
  content = resolveAuth(content, ctx.data);

  // Stage 14: htx:each / htx:if control flow
  content = resolveControlFlow(content, ctx.data);

  // Stage 15: htx:v / {htx:} expression evaluation
  content = exprEngine.evaluate(content, ctx.data);

  // Stage 15b: Extract layout directive AFTER expression eval
  const { directive: layoutDirective, content: contentAfterLayout } = extractLayoutDirective(content);
  content = contentAfterLayout;
  if (layoutDirective?.src) layoutDirective.src = values.restore(layoutDirective.src);

  // Stage 16: Strip remaining htx: directives
  content = stripDirectives(content);

  // Stage 17: Post-layout template processors (module extension hook).
  // Resolved values are still placeholders here; they are restored at stage 22.
  for (const tp of ctx.registry.postProcessors) {
    content = tp.process(content, ctx.data);
  }

  // Stage 18: Layout wrapping
  content = wrapLayout(content, ctx.filePath, ctx.templateRoot, layoutDirective, ctx.request.hxRequest);

  // Stage 19: Post-layout pass (includes, auth, control flow in layout content)
  content = includeResolver.resolve(content, ctx.filePath);
  content = resolveAuth(content, ctx.data);
  content = resolveControlFlow(content, ctx.data);
  content = exprEngine.evaluate(content, ctx.data);

  // Stage 20: Script injection
  content = injectScripts(content, ctx.scriptCollector);

  // Stage 21: Final expression pass (evaluates htx:v in injected scripts)
  content = exprEngine.evaluate(content, ctx.data);

  // Stage 22: Replace PRESTO:SCRIPT placeholders with <script>, strip <htx:raw> wrappers
  content = finalizeScripts(content);
  // An htmx request whose HX-Target names a fragment gets that region only.
  const target = ctx.request.hxRequest ? ctx.request.headers["hx-target"] : undefined;
  content = selectFragment(content, target);
  content = stripComments(content);
  content = stripRawWrappers(content);
  // Values last: each is written once and no stage reads it as template.
  content = values.restore(content);

  return content;
}
