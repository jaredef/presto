// Context Assembler — Builds the static system prompt at boot
// Reads template-context.md + component registry + schema

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ContentAdapter } from "../types";

export interface SchemaTable {
  name: string;
  columns: string[];
}

export function assembleSystemPrompt(
  templateContextPath: string,
  componentRegistry: Record<string, any>,
  schema: SchemaTable[],
  styleGuide?: Record<string, string>,
): string {
  let prompt = "";

  // 1. Template authoring context
  if (existsSync(templateContextPath)) {
    prompt += readFileSync(templateContextPath, "utf-8");
  }

  // 2. Available components
  const compNames = Object.keys(componentRegistry);
  if (compNames.length > 0) {
    prompt += "\n\n## Available Components\n\n";
    for (const name of compNames.sort()) {
      const comp = componentRegistry[name];
      const props = comp.props ? Object.entries(comp.props).map(([k, v]) => `${k}="${v}"`).join(" ") : "";
      prompt += `- **${name}** (Layer ${comp.layer || 0}): \`<htx:component src="/ui/${name}.htx" ${props} />\`\n`;
    }
  }

  // 3. Database schema
  if (schema.length > 0) {
    prompt += "\n\n## Database Schema\n\n";
    for (const table of schema) {
      prompt += `- **${table.name}**: ${table.columns.join(", ")}\n`;
    }
  }

  // 4. Style guide tokens
  if (styleGuide && Object.keys(styleGuide).length > 0) {
    prompt += "\n\n## Style Guide Tokens\n\n";
    prompt += "Use these tokens in class attributes: `class=\"{htx:styles.token-name}\"`\n\n";
    for (const [name, value] of Object.entries(styleGuide)) {
      prompt += `- **${name}**: \`${value}\`\n`;
    }
    prompt += "\nCompose tokens: `class=\"{htx:styles.section} {htx:styles.bg-dark}\"`\n";
    prompt += "NEVER write raw Tailwind classes. Always use style tokens.\n";
  }

  // 5. Response format instruction
  prompt += `\n\n## Response Format

When modifying a template, return the COMPLETE modified .htx source inside a \`\`\`htx code block.
Follow it with a brief explanation of what you changed.

If the user's request doesn't require modifying the template (just a question), respond conversationally without a code block.

Always return the FULL template source, not just the changed portion. The editor replaces the entire source with your output.`;

  return prompt;
}

export function getSchema(adapter: ContentAdapter): SchemaTable[] {
  const tables: SchemaTable[] = [];
  try {
    const a = adapter as any;
    if (typeof a.db?.prepare === "function") {
      const rows = a.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as any[];
      for (const row of rows) {
        const cols = a.db.prepare(`PRAGMA table_info([${row.name}])`).all() as any[];
        tables.push({ name: row.name, columns: cols.map((c: any) => c.name) });
      }
    }
  } catch {}
  return tables;
}
