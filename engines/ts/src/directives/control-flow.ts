// PRESTO-TS v3 — Stage 14: htx:each / htx:if control flow
// Each iteration creates an isolated child context with independent copy of item

import { ExpressionEngine } from "../expressions";
import type { DataContext } from "../types";

const EACH_RE = /<htx:each\s+items="([^"]+)"\s+as="([^"]+)"\s*>([\s\S]*?)<\/htx:each>/g;
const EMPTY_RE = /<htx:empty\s*\/?>/;
const IF_RE = /<htx:if\s+test="([^"]+)"\s*>([\s\S]*?)<\/htx:if>(?:\s*<htx:else\s*>([\s\S]*?)<\/htx:else>)?/g;

const expr = new ExpressionEngine();

export function resolveControlFlow(content: string, data: DataContext): string {
  // Process htx:each
  let result = resolveEach(content, data);
  // Process htx:if/htx:else
  result = resolveIf(result, data);
  return result;
}

function resolveEach(content: string, data: DataContext): string {
  return content.replace(EACH_RE, (_match, itemsPath: string, asVar: string, body: string) => {
    const items = expr.resolvePath(itemsPath, data);

    if (!Array.isArray(items) || items.length === 0) {
      // Render htx:empty section
      const emptyMatch = EMPTY_RE.exec(body);
      if (emptyMatch) {
        const emptyIndex = body.indexOf(emptyMatch[0]);
        return body.substring(emptyIndex + emptyMatch[0].length);
      }
      return "";
    }

    // Split body at htx:empty — content before is the iteration template
    const emptyMatch = EMPTY_RE.exec(body);
    const iterationTemplate = emptyMatch ? body.substring(0, body.indexOf(emptyMatch[0])) : body;

    const parts: string[] = [];
    for (let i = 0; i < items.length; i++) {
      // Create isolated child context with independent copy of item
      const childData: DataContext = {
        ...data,
        [asVar]: structuredClone(items[i]), // independent copy per C2/seed v7
        $index: i,
        $first: i === 0,
        $last: i === items.length - 1,
      };

      // Evaluate expressions within this iteration
      let itemContent = expr.evaluate(iterationTemplate, childData);
      // Recurse control flow for nested each/if
      itemContent = resolveControlFlow(itemContent, childData);
      parts.push(itemContent);
    }

    return parts.join("");
  });
}

function resolveIf(content: string, data: DataContext): string {
  return content.replace(IF_RE, (_match, testPath: string, ifBody: string, elseBody: string | undefined) => {
    const value = expr.resolvePath(testPath, data);
    if (expr.isTruthy(value)) {
      let result = expr.evaluate(ifBody, data);
      result = resolveControlFlow(result, data);
      return result;
    } else if (elseBody) {
      let result = expr.evaluate(elseBody, data);
      result = resolveControlFlow(result, data);
      return result;
    }
    return "";
  });
}
