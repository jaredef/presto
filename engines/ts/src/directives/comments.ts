const TOKENS = /<(script|style|pre|textarea|htx:raw)\b[^>]*>[\s\S]*?<\/\1\s*>|(^[ \t]*)?<!--([\s\S]*?)-->([ \t]*\r?\n)?/gim;

export function stripComments(content: string, log: (msg: string) => void = (m) => console.warn(m)): string {
  return content.replace(TOKENS, (match, protectedTag, indent, body, eol) => {
    if (protectedTag) return match;
    if (/^\s*htx:/.test(body)) log(`[presto] ${body.trim()}`);
    return indent !== undefined && eol !== undefined ? "" : (indent ?? "");
  });
}
