// PRESTO-TS v3 — Stage 14: htx:each / htx:if control flow
// Each iteration creates an isolated child context with independent copy of item

import { ExpressionEngine } from "../expressions";
import type { DataContext } from "../types";

const EACH_OPEN = /<htx:each\s+items="([^"]+)"\s+as="([^"]+)"\s*>/g;
// Opens, closes and empties of htx:each, for pairing a block by depth: a
// nested each closes before its parent does.
const EACH_TOKEN = /<htx:each\s[^>]*>|<\/htx:each>|<htx:empty\s*\/?>/g;
const EACH_CLOSE = "</htx:each>";
const IF_OPEN = /<htx:if\s+test="([^"]+)"\s*>/g;
// Opens and closes of htx:if, and of htx:else, each paired by depth like
// htx:each: a nested if closes before its parent, a nested else likewise.
const IF_TOKEN = /<htx:if\s[^>]*>|<\/htx:if>/g;
const ELSE_TOKEN = /<htx:else\s*>|<\/htx:else>/g;
const ELSE_AFTER = /^\s*<htx:else\s*>/;
const IF_CLOSE = "</htx:if>";
const ELSE_CLOSE = "</htx:else>";

const expr = new ExpressionEngine();

export function resolveControlFlow(content: string, data: DataContext): string {
  // Process htx:each
  let result = resolveEach(content, data);
  // Process htx:if/htx:else
  result = resolveIf(result, data);
  return result;
}

// Where the block whose body starts at `from` closes, and where its own
// htx:empty is (not a nested each's): -1 for either when absent.
function pairBlock(content: string, from: number): { close: number; empty: number; emptyLength: number } {
  let depth = 1;
  let empty = -1;
  let emptyLength = 0;
  EACH_TOKEN.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = EACH_TOKEN.exec(content))) {
    if (m[0] === EACH_CLOSE) {
      depth--;
      if (depth === 0) return { close: m.index, empty, emptyLength };
    } else if (m[0].startsWith("<htx:empty")) {
      if (depth === 1 && empty === -1) {
        empty = m.index;
        emptyLength = m[0].length;
      }
    } else {
      depth++;
    }
  }
  return { close: -1, empty: -1, emptyLength: 0 };
}

function resolveEach(content: string, data: DataContext): string {
  let out = "";
  let at = 0;
  for (;;) {
    EACH_OPEN.lastIndex = at;
    const open = EACH_OPEN.exec(content);
    if (!open) return out + content.substring(at);
    const bodyStart = open.index + open[0].length;
    const { close, empty, emptyLength } = pairBlock(content, bodyStart);
    // An each with no close is left as written; directive stripping removes it.
    if (close === -1) return out + content.substring(at);
    out += content.substring(at, open.index) + expandEach(open[1], open[2], content, bodyStart, close, empty, emptyLength, data);
    at = close + EACH_CLOSE.length;
  }
}

function expandEach(
  itemsPath: string,
  asVar: string,
  content: string,
  bodyStart: number,
  close: number,
  empty: number,
  emptyLength: number,
  data: DataContext,
): string {
  const items = expr.resolvePath(itemsPath, data);

  if (!Array.isArray(items) || items.length === 0) {
    // Render htx:empty section
    return empty === -1 ? "" : content.substring(empty + emptyLength, close);
  }

  // Split body at htx:empty — content before is the iteration template
  const iterationTemplate = content.substring(bodyStart, empty === -1 ? close : empty);

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

    // Nested each/if first, each with its own item in scope; then this
    // iteration's expressions. Evaluated the other way round, an inner
    // item's expressions resolve before it exists and come out empty.
    let itemContent = resolveControlFlow(iterationTemplate, childData);
    itemContent = expr.evaluate(itemContent, childData);
    parts.push(itemContent);
  }

  return parts.join("");
}

// Where the block opened before `from` closes, counting `token`'s opens and
// `close`s by depth: -1 when it does not close.
function closeOf(content: string, from: number, token: RegExp, close: string): number {
  let depth = 1;
  token.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = token.exec(content))) {
    if (m[0] === close) {
      depth--;
      if (depth === 0) return m.index;
    } else {
      depth++;
    }
  }
  return -1;
}

function resolveIf(content: string, data: DataContext): string {
  let out = "";
  let at = 0;
  for (;;) {
    IF_OPEN.lastIndex = at;
    const open = IF_OPEN.exec(content);
    if (!open) return out + content.substring(at);
    const bodyStart = open.index + open[0].length;
    const close = closeOf(content, bodyStart, IF_TOKEN, IF_CLOSE);
    // An if with no close is left as written; directive stripping removes it.
    if (close === -1) return out + content.substring(at);
    let end = close + IF_CLOSE.length;
    let elseBody: string | undefined;
    const elseOpen = ELSE_AFTER.exec(content.substring(end));
    if (elseOpen) {
      const elseStart = end + elseOpen[0].length;
      const elseClose = closeOf(content, elseStart, ELSE_TOKEN, ELSE_CLOSE);
      if (elseClose !== -1) {
        elseBody = content.substring(elseStart, elseClose);
        end = elseClose + ELSE_CLOSE.length;
      }
    }
    out += content.substring(at, open.index) + branch(open[1], content.substring(bodyStart, close), elseBody, data);
    at = end;
  }
}

function branch(testPath: string, ifBody: string, elseBody: string | undefined, data: DataContext): string {
  if (expr.test(testPath, data)) {
    let result = expr.evaluate(ifBody, data);
    result = resolveControlFlow(result, data);
    return result;
  } else if (elseBody) {
    let result = expr.evaluate(elseBody, data);
    result = resolveControlFlow(result, data);
    return result;
  }
  return "";
}
