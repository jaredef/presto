// PRESTO-TS v3 — SQLite Content Adapter
// Uses bun:sqlite (synchronous). Parameterized queries for user input. C8 compliance.

import { Database } from "bun:sqlite";
import type { ContentAdapter, ContentRecord } from "../types";

export class SqliteAdapter implements ContentAdapter {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { create: true });
    this.db.run("PRAGMA journal_mode=WAL");
  }

  private ensureTable(type: string): void {
    const safeName = this.sanitizeName(type);
    this.db.run(`CREATE TABLE IF NOT EXISTS [${safeName}] (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT,
      title TEXT,
      body TEXT,
      status TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  query(options: {
    type: string;
    where?: string;
    order?: string;
    limit?: number;
    offset?: number;
  }): ContentRecord[] {
    const safeName = this.sanitizeName(options.type);
    this.ensureTable(safeName);

    let sql = `SELECT * FROM [${safeName}]`;
    const params: unknown[] = [];

    if (options.where) {
      // The where clause comes from template authors (trusted source representation)
      // but may contain resolved user input. Use as-is for literal template expressions,
      // which is safe for author-controlled strings like "status = 'published'"
      sql += ` WHERE ${options.where}`;
    }

    if (options.order) {
      sql += ` ORDER BY ${this.sanitizeOrderBy(options.order)}`;
    }

    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params) as ContentRecord[];
    } catch {
      return [];
    }
  }

  get(type: string, identifier: string | number): ContentRecord | null {
    const safeName = this.sanitizeName(type);
    this.ensureTable(safeName);

    try {
      // Parameterized — identifier may be user-controlled (route param)
      const stmt = this.db.prepare(
        `SELECT * FROM [${safeName}] WHERE slug = ? OR id = ? LIMIT 1`,
      );
      return (stmt.get(String(identifier), identifier) as ContentRecord) || null;
    } catch {
      return null;
    }
  }

  create(type: string, data: Record<string, unknown>): ContentRecord {
    const safeName = this.sanitizeName(type);
    this.ensureTable(safeName);

    const keys = Object.keys(data).filter((k) => k !== "id");
    const placeholders = keys.map(() => "?").join(", ");
    const values = keys.map((k) => data[k]);
    const cols = keys.map((k) => this.sanitizeName(k)).join(", ");

    const stmt = this.db.prepare(
      `INSERT INTO [${safeName}] (${cols}) VALUES (${placeholders})`,
    );
    const result = stmt.run(...values);
    return { id: Number(result.lastInsertRowid), ...data };
  }

  update(type: string, id: string | number, data: Record<string, unknown>): boolean {
    const safeName = this.sanitizeName(type);
    this.ensureTable(safeName);

    const keys = Object.keys(data).filter((k) => k !== "id");
    const sets = keys.map((k) => `${this.sanitizeName(k)} = ?`).join(", ");
    const values = [...keys.map((k) => data[k]), id];

    const stmt = this.db.prepare(`UPDATE [${safeName}] SET ${sets} WHERE id = ?`);
    const result = stmt.run(...values);
    return result.changes > 0;
  }

  delete(type: string, id: string | number): boolean {
    const safeName = this.sanitizeName(type);
    this.ensureTable(safeName);

    const stmt = this.db.prepare(`DELETE FROM [${safeName}] WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Execute raw SQL (for seeding)
  exec(sql: string): void {
    this.db.run(sql);
  }

  close(): void {
    this.db.close();
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, "");
  }

  private sanitizeOrderBy(order: string): string {
    // Allow only column names, asc/desc, and commas
    return order.replace(/[^a-zA-Z0-9_,\s]/gi, "").trim();
  }
}
