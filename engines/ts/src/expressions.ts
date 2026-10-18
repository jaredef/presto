// PRESTO-TS v3 — Expression Engine
// Implements htx:v, {htx:}, pipes, HTML escaping, script/raw block protection

import { TemplateError, type DataContext } from "./types";
import { parseOperand, parseTest, evalOperand, evalTest, type Evaluator } from "./grammar";

// Patterns from seed
const HTX_V_TAG = /<htx:v(\s+raw)?(?:\s+path\s*=\s*"([^"]*)")?\s*(?:\/>|>([\s\S]*?)<\/htx:v>)/g;
const HTX_ATTR = /\{htx:([^}]+)\}/g;
const SCRIPT_PROT = /<script(\s[^>]*)?>[\s\S]*?<\/script>/gi;
const RAW_PROT = /<htx:raw(?:\s[^>]*)?>[\s\S]*?<\/htx:raw>/gi;

// Resolved values are written once (K4, .plans/htxlang-closure-plan.md). In the pipeline,
// evaluate() emits each value as a placeholder into a per-request ValueTable, restored in a
// single pass at stage 22, so no later stage can read a value back as template. Called without
// a table (unit use), evaluate() returns the values inline, still in one pass.
const VALUES = Symbol.for("presto.values");
const SLOT = /\uE000(\d+)\uE001/g;

export class ValueTable {
  private values: string[] = [];

  put(value: string): string {
    this.values.push(value);
    return `\uE000${this.values.length - 1}\uE001`;
  }

  // One pass; restored text is never rescanned.
  restore(content: string): string {
    return content.replace(SLOT, (_m, n: string) => this.values[Number(n)] ?? "");
  }

  attach(data: DataContext): void {
    (data as Record<symbol, unknown>)[VALUES] = this;
  }

  static of(data: DataContext): ValueTable | undefined {
    return (data as Record<symbol, unknown>)[VALUES] as ValueTable | undefined;
  }
}

// htx:v tags and {htx:} bindings, matched in one scan so neither reads the other's output.
const EXPRESSION = new RegExp(`${HTX_V_TAG.source}|${HTX_ATTR.source}`, "g");

export class ExpressionEngine {
  // Main entry: evaluate all expressions in a template string
  evaluate(template: string, data: DataContext): string {
    // 1) Protect script + raw blocks with UUID markers
    const markers = new Map<string, string>();
    let content = this.protectBlocks(template, SCRIPT_PROT, markers);
    content = this.protectBlocks(content, RAW_PROT, markers);

    // 2) Replace htx:v tags and {htx:} bindings
    const table = ValueTable.of(data);
    const emit = (str: string) => (table ? table.put(str) : str);
    content = content.replace(EXPRESSION, (_match, rawAttr, pathAttr, innerContent, attrExpr) => {
      if (attrExpr !== undefined) {
        return emit(this.escapeHtml(this.valueToString(this.resolvePath(attrExpr.trim(), data))));
      }
      const path = (pathAttr || innerContent || "").trim();
      if (!path) return "";
      const str = this.valueToString(this.resolvePath(path, data));
      return emit(rawAttr ? str : this.escapeHtml(str));
    });

    // 3) Restore protected blocks
    for (const [marker, original] of markers) {
      content = content.replace(marker, () => original);
    }

    return content;
  }

  // A value expression: a path and its pipe chain, or a literal (src/grammar.ts).
  resolvePath(expression: string, data: DataContext): unknown {
    return evalOperand(parseOperand(expression.trim()), this.evaluator(data));
  }

  // An htx:if test: comparisons, and/or/not, or a lone value for truthiness.
  test(expression: string, data: DataContext): boolean {
    return evalTest(parseTest(expression.trim()), this.evaluator(data));
  }

  private evaluator(data: DataContext): Evaluator {
    return {
      lookup: (path) => this.lookup(path, data),
      pipe: (value, name, args) => this.applyPipe(value, name, args),
      truthy: (value) => this.isTruthy(value),
      text: (value) => this.valueToString(value),
    };
  }

  // Walk a dot-path into the context. Null at any step is undefined.
  private lookup(path: string, data: DataContext): unknown {
    let current: unknown = data;
    for (const key of path.split(".")) {
      if (current == null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  // The closed pipe set (K8). An unknown pipe or a wrong argument is a TemplateError (K5).
  applyPipe(value: unknown, pipe: string, args: (string | number | boolean)[] = []): unknown {
    const str = this.valueToString(value);
    const arity = (n: number) => {
      if (args.length !== n) throw new TemplateError(`Pipe "${pipe}" takes ${n} argument${n === 1 ? "" : "s"}`);
    };
    const num = (a: unknown) => {
      if (typeof a !== "number") throw new TemplateError(`Pipe "${pipe}" takes a number`);
      return a;
    };
    const text = (a: unknown) => {
      if (typeof a !== "string") throw new TemplateError(`Pipe "${pipe}" takes text`);
      return a;
    };
    const amount = () => (Array.isArray(value) ? value.length : Number(str));
    const finite = (n: number) => (Number.isFinite(n) ? n : "");
    switch (pipe) {
      case "uppercase": arity(0); return str.toUpperCase();
      case "lowercase": arity(0); return str.toLowerCase();
      case "capitalize": arity(0); return str.charAt(0).toUpperCase() + str.slice(1);
      case "trim": arity(0); return str.trim();
      case "length": arity(0); return Array.isArray(value) ? value.length : str.length;
      case "json": arity(0); return JSON.stringify(value);
      case "plus": arity(1); return finite(amount() + num(args[0]));
      case "minus": arity(1); return finite(amount() - num(args[0]));
      case "pad": arity(1); return str.padStart(num(args[0]), "0");
      case "default": arity(1); return this.isTruthy(value) ? value : args[0];
      case "plural": arity(2); return amount() === 1 ? text(args[0]) : text(args[1]);
      default: throw new TemplateError(`Unknown pipe "${pipe}"`);
    }
  }

  // Truthiness: Falsy = null, undefined, false, 0 (integer or float), "", []
  isTruthy(value: unknown): boolean {
    if (value === null || value === undefined || value === false) return false;
    if (value === 0) return false;
    if (value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }

  escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  valueToString(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  private protectBlocks(content: string, pattern: RegExp, markers: Map<string, string>): string {
    return content.replace(pattern, (match) => {
      const marker = `<!--PRESTO_PROTECT_${crypto.randomUUID()}-->`;
      markers.set(marker, match);
      return marker;
    });
  }
}
