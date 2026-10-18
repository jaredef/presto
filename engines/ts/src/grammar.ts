// htxlang expression grammar (F1, F2; .plans/htxlang-closure-plan.md K5, K8, K9).
// One closed alphabet for htx:v, {htx:} and htx:if test:
//
//   test     := or
//   or       := and ("or" and)*
//   and      := unary ("and" unary)*
//   unary    := "not" unary | compare
//   compare  := operand (op operand)?          op := == | != | lt | le | gt | ge
//   operand  := literal | path ("|" pipe (":" literal)*)*
//   literal  := 'text' | number | true | false
//
// Ordering operators are words because a ">" inside a directive's attributes would end the
// tag for the engine's scanner (K9). Anything outside the alphabet is a TemplateError, raised
// before a value is emitted (K5); nothing is evaluated by the host language (K8).

import { TemplateError } from "./types";

type Token = { kind: "str" | "num" | "word" | "op" | "pipe" | "colon"; text: string; value?: unknown };
type Literal = string | number | boolean;
type Operand = { literal: Literal } | { path: string; pipes: { name: string; args: Literal[] }[] };
type Node =
  | { type: "operand"; operand: Operand }
  | { type: "not"; arg: Node }
  | { type: "and" | "or"; left: Node; right: Node }
  | { type: "compare"; op: string; left: Operand; right: Operand };

const TOKEN = /\s*(?:'((?:[^'\\]|\\.)*)'|(-?\d+(?:\.\d+)?)(?![\w$])|(==|!=)|(\|)|(:)|([A-Za-z_$][\w$.\-]*))/y;
const WORD_OPS = new Set(["lt", "le", "gt", "ge"]);
const KEYWORDS = new Set(["and", "or", "not", "lt", "le", "gt", "ge", "true", "false"]);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  TOKEN.lastIndex = 0;
  let at = 0;
  while (at < source.length) {
    if (/^\s*$/.test(source.slice(at))) break;
    TOKEN.lastIndex = at;
    const m = TOKEN.exec(source);
    if (!m) throw new TemplateError(`Unexpected "${source.slice(at).trim()[0]}" in expression "${source}"`);
    at = TOKEN.lastIndex;
    if (m[1] !== undefined) tokens.push({ kind: "str", text: m[0], value: m[1].replace(/\\(.)/g, "$1") });
    else if (m[2] !== undefined) tokens.push({ kind: "num", text: m[2], value: Number(m[2]) });
    else if (m[3] !== undefined) tokens.push({ kind: "op", text: m[3] });
    else if (m[4] !== undefined) tokens.push({ kind: "pipe", text: "|" });
    else if (m[5] !== undefined) tokens.push({ kind: "colon", text: ":" });
    else tokens.push({ kind: WORD_OPS.has(m[6]) ? "op" : "word", text: m[6] });
  }
  return tokens;
}

class Parser {
  private i = 0;
  constructor(private tokens: Token[], private source: string) {}

  private peek(): Token | undefined { return this.tokens[this.i]; }
  private fail(why: string): never { throw new TemplateError(`${why} in expression "${this.source}"`); }

  done(): void {
    if (this.i < this.tokens.length) this.fail(`Unexpected "${this.tokens[this.i].text}"`);
  }

  test(): Node { return this.or(); }

  private or(): Node {
    let left = this.and();
    while (this.peek()?.kind === "word" && this.peek()!.text === "or") { this.i++; left = { type: "or", left, right: this.and() }; }
    return left;
  }

  private and(): Node {
    let left = this.unary();
    while (this.peek()?.kind === "word" && this.peek()!.text === "and") { this.i++; left = { type: "and", left, right: this.unary() }; }
    return left;
  }

  private unary(): Node {
    if (this.peek()?.kind === "word" && this.peek()!.text === "not") { this.i++; return { type: "not", arg: this.unary() }; }
    const left = this.operand();
    if (this.peek()?.kind === "op") {
      const op = this.tokens[this.i++].text;
      return { type: "compare", op, left, right: this.operand() };
    }
    return { type: "operand", operand: left };
  }

  operand(): Operand {
    const t = this.tokens[this.i++];
    if (!t) this.fail("Missing operand");
    if (t.kind === "str" || t.kind === "num") return { literal: t.value as Literal };
    if (t.kind !== "word") this.fail(`Unexpected "${t.text}"`);
    if (t.text === "true" || t.text === "false") return { literal: t.text === "true" };
    if (KEYWORDS.has(t.text)) this.fail(`Unexpected "${t.text}"`);
    const pipes: { name: string; args: Literal[] }[] = [];
    while (this.peek()?.kind === "pipe") {
      this.i++;
      const name = this.tokens[this.i++];
      if (!name || name.kind !== "word") this.fail("Missing pipe name");
      const args: Literal[] = [];
      while (this.peek()?.kind === "colon") {
        this.i++;
        const a = this.tokens[this.i++];
        if (!a || (a.kind !== "str" && a.kind !== "num" && !(a.kind === "word" && (a.text === "true" || a.text === "false")))) {
          this.fail(`Pipe "${name.text}" takes literal arguments`);
        }
        args.push(a.kind === "word" ? a.text === "true" : (a.value as Literal));
      }
      pipes.push({ name: name.text, args });
    }
    return { path: t.text, pipes };
  }
}

// Parsed once per distinct source; templates repeat the same expressions across iterations.
const operandCache = new Map<string, Operand>();
const testCache = new Map<string, Node>();

export function parseOperand(source: string): Operand {
  let hit = operandCache.get(source);
  if (!hit) {
    const p = new Parser(tokenize(source), source);
    hit = p.operand();
    p.done();
    operandCache.set(source, hit);
  }
  return hit;
}

export function parseTest(source: string): Node {
  let hit = testCache.get(source);
  if (!hit) {
    const p = new Parser(tokenize(source), source);
    hit = p.test();
    p.done();
    testCache.set(source, hit);
  }
  return hit;
}

export interface Evaluator {
  lookup(path: string): unknown;
  pipe(value: unknown, name: string, args: Literal[]): unknown;
  truthy(value: unknown): boolean;
  text(value: unknown): string;
}

export function evalOperand(op: Operand, ev: Evaluator): unknown {
  if ("literal" in op) return op.literal;
  let value = ev.lookup(op.path);
  for (const p of op.pipes) value = ev.pipe(value, p.name, p.args);
  return value;
}

// Numbers compare as numbers when both sides are numbers or numeric text; anything else
// compares as text, with a missing value as "".
function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
}

function compare(op: string, a: unknown, b: unknown, ev: Evaluator): boolean {
  const na = asNumber(a), nb = asNumber(b);
  const [x, y] = na !== null && nb !== null ? [na, nb] : [ev.text(a), ev.text(b)];
  switch (op) {
    case "==": return x === y;
    case "!=": return x !== y;
    case "lt": return x < y;
    case "le": return x <= y;
    case "gt": return x > y;
    case "ge": return x >= y;
  }
  throw new TemplateError(`Unknown operator "${op}"`);
}

export function evalTest(node: Node, ev: Evaluator): boolean {
  switch (node.type) {
    case "operand": return ev.truthy(evalOperand(node.operand, ev));
    case "not": return !evalTest(node.arg, ev);
    case "and": return evalTest(node.left, ev) && evalTest(node.right, ev);
    case "or": return evalTest(node.left, ev) || evalTest(node.right, ev);
    case "compare": return compare(node.op, evalOperand(node.left, ev), evalOperand(node.right, ev), ev);
  }
}
