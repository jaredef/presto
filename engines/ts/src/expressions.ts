// PRESTO-TS v3 — Expression Engine
// Implements htx:v, {htx:}, pipes, HTML escaping, script/raw block protection

import type { DataContext } from "./types";

// Patterns from seed
const HTX_V_TAG = /<htx:v(\s+raw)?(?:\s+path\s*=\s*"([^"]*)")?\s*(?:\/>|>([\s\S]*?)<\/htx:v>)/g;
const HTX_ATTR = /\{htx:([^}]+)\}/g;
const SCRIPT_PROT = /<script(\s[^>]*)?>[\s\S]*?<\/script>/gi;
const RAW_PROT = /<htx:raw(?:\s[^>]*)?>[\s\S]*?<\/htx:raw>/gi;

export class ExpressionEngine {
  // Main entry: evaluate all expressions in a template string
  evaluate(template: string, data: DataContext): string {
    // 1) Protect script + raw blocks with UUID markers
    const markers = new Map<string, string>();
    let content = this.protectBlocks(template, SCRIPT_PROT, markers);
    content = this.protectBlocks(content, RAW_PROT, markers);

    // 2) Replace htx:v tags
    content = content.replace(HTX_V_TAG, (_match, rawAttr, pathAttr, innerContent) => {
      const isRaw = !!rawAttr;
      const path = (pathAttr || innerContent || "").trim();
      if (!path) return "";
      const value = this.resolvePath(path, data);
      const str = this.valueToString(value);
      return isRaw ? str : this.escapeHtml(str);
    });

    // 3) Replace {htx:} attribute bindings
    content = content.replace(HTX_ATTR, (_match, expr) => {
      const value = this.resolvePath(expr.trim(), data);
      return this.escapeHtml(this.valueToString(value));
    });

    // 4) Restore protected blocks
    for (const [marker, original] of markers) {
      content = content.replace(marker, original);
    }

    return content;
  }

  // Resolve a dot-path with optional pipe
  resolvePath(expression: string, data: DataContext): unknown {
    // Split on "|" for pipes
    const pipeIndex = expression.indexOf("|");
    let path: string;
    let pipe: string | null = null;

    if (pipeIndex !== -1) {
      path = expression.substring(0, pipeIndex).trim();
      pipe = expression.substring(pipeIndex + 1).trim();
    } else {
      path = expression.trim();
    }

    // Walk into object
    const keys = path.split(".");
    let current: unknown = data;
    for (const key of keys) {
      if (current == null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[key];
    }

    // Apply pipe if present
    if (pipe) {
      current = this.applyPipe(current, pipe);
    }

    return current;
  }

  applyPipe(value: unknown, pipe: string): unknown {
    const str = this.valueToString(value);
    switch (pipe) {
      case "uppercase":
        return str.toUpperCase();
      case "lowercase":
        return str.toLowerCase();
      case "capitalize":
        return str.charAt(0).toUpperCase() + str.slice(1);
      case "trim":
        return str.trim();
      case "length":
        return Array.isArray(value) ? value.length : str.length;
      case "json":
        return JSON.stringify(value);
      default:
        return value;
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

  // { is encoded too: later pipeline passes evaluate {htx:...} again, so printed
  // data (a form value, a query param) must not be able to form an expression.
  escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/\{/g, "&#123;");
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
