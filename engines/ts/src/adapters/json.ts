// PRESTO-TS: JSON file content adapter (F8, .plans/htxlang-closure-plan.md K3, K5, K10).
// Each type is <dir>/<type>.json holding an array of records. For small sites whose content
// is files in the repository.
//
// where:  field (= | != | ?=) (? | 'text' | number)  joined by AND. ? binds from params in order.
//         ?= is an optional equality: when the value is "" the clause matches every row
//         (a filter set to "all").
// order:  field [asc|desc], comma-separated. Numbers (and numeric text) sort as numbers.
// Anything outside that grammar throws a TemplateError instead of matching everything.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TemplateError, type ContentAdapter, type ContentRecord } from "../types";

type Clause = { field: string; op: "=" | "!=" | "?="; value: unknown };

const CLAUSE = /^\s*(\w+)\s*(!=|\?=|=)\s*(\?|'((?:[^'\\]|\\.)*)'|(-?\d+(?:\.\d+)?))\s*$/;
const ORDER = /^\s*(\w+)(?:\s+(asc|desc))?\s*$/i;

function parseWhere(where: string, params: unknown[]): Clause[] {
  let next = 0;
  const clauses = where.split(/\s+AND\s+/i).map((part) => {
    const m = CLAUSE.exec(part);
    if (!m) throw new TemplateError(`JsonAdapter cannot read where clause "${part.trim()}"`);
    let value: unknown;
    if (m[3] === "?") {
      if (next >= params.length) throw new TemplateError(`where "${where}" has more ? than params`);
      value = params[next++];
    } else {
      value = m[4] !== undefined ? m[4].replace(/\\(.)/g, "$1") : m[5];
    }
    return { field: m[1], op: m[2] as Clause["op"], value };
  });
  if (next !== params.length) throw new TemplateError(`where "${where}" has fewer ? than params`);
  return clauses;
}

const asNumber = (v: unknown) =>
  typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null;

function cmp(a: unknown, b: unknown): number {
  const x = asNumber(a), y = asNumber(b);
  if (x !== null && y !== null) return x - y;
  const s = String(a ?? ""), t = String(b ?? "");
  return s === t ? 0 : s < t ? -1 : 1;
}

export class JsonAdapter implements ContentAdapter {
  constructor(private dir: string) {}

  private file(type: string): string {
    const name = type.replace(/[^\w-]/g, "");
    if (!name) throw new TemplateError(`Invalid content type "${type}"`);
    return join(this.dir, `${name}.json`);
  }

  // Read on each call, so edits to the files show without a restart.
  private load(type: string): ContentRecord[] {
    const file = this.file(type);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf-8")) as ContentRecord[]) : [];
  }

  private save(type: string, rows: ContentRecord[]): void {
    const file = this.file(type);
    writeFileSync(`${file}.tmp`, JSON.stringify(rows, null, 2) + "\n");
    renameSync(`${file}.tmp`, file);
  }

  query(options: { type: string; where?: string; params?: unknown[]; order?: string; limit?: number; offset?: number }): ContentRecord[] {
    let rows = this.load(options.type);
    if (options.where?.trim()) {
      const clauses = parseWhere(options.where, options.params ?? []);
      rows = rows.filter((r) => clauses.every((c) => {
        if (c.op === "?=" && String(c.value) === "") return true;
        return (String(r[c.field] ?? "") === String(c.value)) !== (c.op === "!=");
      }));
    } else if (options.params?.length) {
      throw new TemplateError("params given without a where clause");
    }
    if (options.order?.trim()) {
      const keys = options.order.split(",").map((part) => {
        const m = ORDER.exec(part);
        if (!m) throw new TemplateError(`JsonAdapter cannot read order "${part.trim()}"`);
        return { field: m[1], sign: m[2]?.toLowerCase() === "desc" ? -1 : 1 };
      });
      // Stable: equal keys keep file order.
      rows = [...rows].sort((a, b) => {
        for (const k of keys) {
          const d = cmp(a[k.field], b[k.field]);
          if (d !== 0) return d * k.sign;
        }
        return 0;
      });
    }
    const start = options.offset ?? 0;
    return rows.slice(start, options.limit ? start + options.limit : undefined);
  }

  get(type: string, identifier: string | number): ContentRecord | null {
    const id = String(identifier);
    return this.load(type).find((r) => r.slug === id || String(r.id) === id) ?? null;
  }

  create(type: string, data: Record<string, unknown>): ContentRecord {
    const rows = this.load(type);
    const id = rows.reduce((max, r) => Math.max(max, asNumber(r.id) ?? 0), 0) + 1;
    const record = { ...data, id } as ContentRecord;
    this.save(type, [...rows, record]);
    return record;
  }

  update(type: string, id: string | number, data: Record<string, unknown>): boolean {
    const rows = this.load(type);
    const at = rows.findIndex((r) => String(r.id) === String(id));
    if (at === -1) return false;
    rows[at] = { ...rows[at], ...data, id: rows[at].id };
    this.save(type, rows);
    return true;
  }

  delete(type: string, id: string | number): boolean {
    const rows = this.load(type);
    const kept = rows.filter((r) => String(r.id) !== String(id));
    if (kept.length === rows.length) return false;
    this.save(type, kept);
    return true;
  }
}
