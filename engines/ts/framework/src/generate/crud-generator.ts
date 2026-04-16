// Hypermedia App — CRUD Page Generator
// hypermedia generate crud post title:text body:text status:text
// Generates: list, detail, create, edit, delete pages + schema + seed

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface FieldDef {
  name: string;
  type: "text" | "number" | "bool";
}

export function parseCrudArgs(args: string[]): { name: string; fields: FieldDef[] } | null {
  if (args.length < 2) return null;
  const name = args[0];
  const fields: FieldDef[] = [];

  for (let i = 1; i < args.length; i++) {
    const [fieldName, fieldType] = args[i].split(":");
    if (!fieldName || !fieldType) continue;
    const type = (fieldType === "number" || fieldType === "int" || fieldType === "integer") ? "number"
      : (fieldType === "bool" || fieldType === "boolean") ? "bool"
      : "text";
    fields.push({ name: fieldName, type });
  }

  return { name, fields };
}

export function generateCrud(pagesDir: string, name: string, fields: FieldDef[]): string[] {
  const dir = join(pagesDir, name);
  const editDir = join(dir, "[slug]");
  mkdirSync(editDir, { recursive: true });

  const created: string[] = [];

  // Ensure slug field exists
  const hasSlug = fields.some(f => f.name === "slug");
  const allFields = hasSlug ? fields : [{ name: "slug", type: "text" as const }, ...fields];

  // 1. List page
  const listPage = generateListPage(name, allFields);
  writeFileSync(join(dir, "index.htx"), listPage);
  created.push(`${name}/index.htx`);

  // 2. Detail page
  const detailPage = generateDetailPage(name, allFields);
  writeFileSync(join(dir, "[slug].htx"), detailPage);
  created.push(`${name}/[slug].htx`);

  // 3. Create form
  const createPage = generateCreatePage(name, allFields);
  writeFileSync(join(dir, "new.htx"), createPage);
  created.push(`${name}/new.htx`);

  // 4. Edit form
  const editPage = generateEditPage(name, allFields);
  writeFileSync(join(editDir, "edit.htx"), editPage);
  created.push(`${name}/[slug]/edit.htx`);

  // 5. Delete confirmation
  const deletePage = generateDeletePage(name);
  writeFileSync(join(editDir, "delete.htx"), deletePage);
  created.push(`${name}/[slug]/delete.htx`);

  return created;
}

export function generateSchema(name: string, fields: FieldDef[]): string {
  const cols = fields.map(f => {
    const sqlType = f.type === "number" ? "INTEGER" : f.type === "bool" ? "INTEGER" : "TEXT";
    return `  ${f.name} ${sqlType}`;
  });
  return `CREATE TABLE IF NOT EXISTS [${name}] (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
${cols.join(",\n")},
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`;
}

export function generateSeed(name: string, fields: FieldDef[], count = 3): string {
  const lines: string[] = [];
  for (let i = 1; i <= count; i++) {
    const vals = fields.map(f => {
      if (f.name === "slug") return `'${name}-${i}'`;
      if (f.name === "status") return `'published'`;
      if (f.type === "number") return `${i * 10}`;
      if (f.type === "bool") return `${i % 2}`;
      return `'${f.name.charAt(0).toUpperCase() + f.name.slice(1)} ${i}'`;
    });
    const cols = fields.map(f => f.name).join(", ");
    lines.push(`INSERT INTO [${name}] (${cols}) VALUES (${vals.join(", ")});`);
  }
  return lines.join("\n");
}

function generateListPage(name: string, fields: FieldDef[]): string {
  const displayFields = fields.filter(f => f.name !== "slug").slice(0, 3);
  const titleField = displayFields[0]?.name || "id";

  return `<!-- Layer 0: List page with server-side data.
     htx:data queries SQLite. htx:each iterates results.
     No client JavaScript. No loading state.
     Escape: add search-input component (Layer 2). -->

<h1>${capitalize(name)}s</h1>
<a href="/${name}/new" class="ui-btn ui-btn-default ui-btn-sm" style="margin-bottom:1.5rem">Create ${capitalize(name)}</a>

<htx:data type="${name}" order="id desc" limit="20" as="items" />
<div class="app-grid">
  <htx:each items="items" as="item">
  <htx:component src="/ui/card.htx" title="{htx:item.${titleField}}">
${displayFields.slice(1).map(f => `    <p><htx:v>item.${f.name}</htx:v></p>`).join("\n")}
    <div style="margin-top:0.75rem">
      <a href="/${name}/{htx:item.slug}">View</a>
      <a href="/${name}/{htx:item.slug}/edit" style="margin-left:0.75rem">Edit</a>
    </div>
  </htx:component>
  <htx:empty />
  <htx:component src="/ui/alert.htx" variant="info" title="No ${name}s yet">Create your first ${name} to see it here.</htx:component>
  </htx:each>
</div>
`;
}

function generateDetailPage(name: string, fields: FieldDef[]): string {
  const titleField = fields.find(f => f.name !== "slug")?.name || "id";
  const bodyFields = fields.filter(f => f.name !== "slug" && f.name !== titleField);

  return `<!-- Layer 0: Detail page with slug-based lookup.
     htx:data resolves a single record from the URL param.
     Escape: add inline editing via htx:script (Layer 2). -->

<htx:data type="${name}" where="slug = '{htx:params.slug}'" limit="1" as="item_list" />
<htx:each items="item_list" as="item">
<article class="app-section" style="max-width:700px">
  <h1><htx:v>item.${titleField}</htx:v></h1>
${bodyFields.map(f => `  <p><strong>${capitalize(f.name)}:</strong> <htx:v>item.${f.name}</htx:v></p>`).join("\n")}
  <div style="margin-top:2rem">
    <a href="/${name}/{htx:item.slug}/edit" class="ui-btn ui-btn-outline ui-btn-sm">Edit</a>
    <a href="/${name}/{htx:item.slug}/delete" class="ui-btn ui-btn-destructive ui-btn-sm" style="margin-left:0.5rem">Delete</a>
  </div>
  <a href="/${name}" style="display:inline-block;margin-top:1.5rem">&larr; Back to ${name}s</a>
</article>
<htx:empty />
<section class="app-section">
  <h1>${capitalize(name)} not found</h1>
  <a href="/${name}">&larr; Back to ${name}s</a>
</section>
</htx:each>
`;
}

function generateCreatePage(name: string, fields: FieldDef[]): string {
  const formFields = fields.filter(f => f.name !== "slug");
  const inputLines = formFields.map(f => {
    if (f.name === "status") {
      return `    <htx:component src="/ui/select.htx" label="${capitalize(f.name)}" name="${f.name}">
      <option value="draft">Draft</option>
      <option value="published">Published</option>
    </htx:component>`;
    }
    if (f.type === "bool") {
      return `    <htx:component src="/ui/select.htx" label="${capitalize(f.name)}" name="${f.name}">
      <option value="0">No</option>
      <option value="1">Yes</option>
    </htx:component>`;
    }
    const inputType = f.type === "number" ? "number" : "text";
    const isLong = f.name === "body" || f.name === "description" || f.name === "content";
    if (isLong) {
      return `    <htx:component src="/ui/textarea.htx" label="${capitalize(f.name)}" name="${f.name}" rows="6" />`;
    }
    return `    <htx:component src="/ui/input.htx" label="${capitalize(f.name)}" type="${inputType}" name="${f.name}" required="required" />`;
  });

  return `<!-- Layer 0: Create form with signed mutation token.
     htx:action generates an HMAC-SHA256 token. Zero client JS.
     Escape: add client-side validation (Layer 2). -->

<section class="app-section" style="max-width:600px">
  <h1>Create ${capitalize(name)}</h1>
  <htx:component src="/ui/form.htx" action="create" type="${name}">
${inputLines.join("\n")}
  </htx:component>
  <a href="/${name}" style="display:inline-block;margin-top:1rem">&larr; Cancel</a>
</section>
`;
}

function generateEditPage(name: string, fields: FieldDef[]): string {
  const formFields = fields.filter(f => f.name !== "slug");
  const inputLines = formFields.map(f => {
    if (f.name === "status") {
      return `      <htx:component src="/ui/select.htx" label="${capitalize(f.name)}" name="${f.name}">
        <option value="draft">Draft</option>
        <option value="published">Published</option>
      </htx:component>`;
    }
    const isLong = f.name === "body" || f.name === "description" || f.name === "content";
    if (isLong) {
      return `      <htx:component src="/ui/textarea.htx" label="${capitalize(f.name)}" name="${f.name}" rows="6" />`;
    }
    return `      <htx:component src="/ui/input.htx" label="${capitalize(f.name)}" name="${f.name}" value="{htx:item.${f.name}}" />`;
  });

  return `<!-- Layer 0: Edit form. htx:data loads the record.
     htx:action with record ID generates an update token.
     Escape: add auto-save via htx:script (Layer 2). -->

<htx:data type="${name}" where="slug = '{htx:params.slug}'" limit="1" as="item_list" />
<htx:each items="item_list" as="item">
<section class="app-section" style="max-width:600px">
  <h1>Edit <htx:v>item.${formFields[0]?.name || "id"}</htx:v></h1>
  <htx:component src="/ui/form.htx" action="update" type="${name}" record="{htx:item.id}">
${inputLines.join("\n")}
  </htx:component>
  <a href="/${name}/{htx:item.slug}" style="display:inline-block;margin-top:1rem">&larr; Cancel</a>
</section>
<htx:empty />
<section class="app-section">
  <h1>${capitalize(name)} not found</h1>
  <a href="/${name}">&larr; Back</a>
</section>
</htx:each>
`;
}

function generateDeletePage(name: string): string {
  return `<!-- Layer 0: Delete confirmation with signed token.
     Two-step: GET shows confirmation, POST executes deletion. -->

<htx:data type="${name}" where="slug = '{htx:params.slug}'" limit="1" as="item_list" />
<htx:each items="item_list" as="item">
<section class="app-section" style="max-width:500px">
  <htx:component src="/ui/alert.htx" variant="error" title="Delete ${capitalize(name)}">
    Are you sure you want to delete this ${name}? This action cannot be undone.
  </htx:component>
  <div style="margin-top:1.5rem">
    <htx:component src="/ui/form.htx" action="delete" type="${name}" record="{htx:item.id}">
    </htx:component>
  </div>
  <a href="/${name}/{htx:item.slug}" style="display:inline-block;margin-top:1rem">&larr; Cancel</a>
</section>
<htx:empty />
<section class="app-section">
  <h1>${capitalize(name)} not found</h1>
</section>
</htx:each>
`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
