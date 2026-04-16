// PRESTO-TS v3 — Stage 16: Strip remaining htx: directives
// MUST protect htx:raw blocks during stripping. MUST NOT strip layout directive (already extracted).

const RAW_PROT = /<htx:raw(?:\s[^>]*)?>[\s\S]*?<\/htx:raw>/gi;

// Strip all remaining htx: tags except htx:raw (which is protected)
const HTX_TAGS = /<\/?htx:\w+[^>]*\/?>/g;

export function stripDirectives(content: string): string {
  // 1. Protect htx:raw blocks with UUID markers
  const markers = new Map<string, string>();
  let result = content.replace(RAW_PROT, (match) => {
    const marker = `<!--PRESTO_RAW_${crypto.randomUUID()}-->`;
    markers.set(marker, match);
    return marker;
  });

  // 2. Strip remaining htx: tags
  result = result.replace(HTX_TAGS, "");

  // 3. Restore htx:raw blocks
  for (const [marker, original] of markers) {
    result = result.replace(marker, original);
  }

  return result;
}

// Stage 22 (partial): Strip <htx:raw> wrapper tags, leaving inner content
export function stripRawWrappers(content: string): string {
  return content.replace(/<htx:raw(?:\s[^>]*)?>([\s\S]*?)<\/htx:raw>/gi, "$1");
}
