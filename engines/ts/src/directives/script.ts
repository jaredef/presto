// PRESTO-TS v3 — Stage 8: Page-level htx:script extraction
// Extracts htx:script blocks from the page template into scriptCollector

const SCRIPT_RE = /<htx:script>([\s\S]*?)<\/htx:script>/g;

export function extractPageScripts(content: string, scriptCollector: string[]): string {
  return content.replace(SCRIPT_RE, (_match, body: string) => {
    scriptCollector.push(body.trim());
    return "";
  });
}

// Stage 20: Inject collected scripts before </body> via PRESTO:SCRIPT placeholders
export function injectScripts(content: string, scripts: string[]): string {
  if (scripts.length === 0) return content;

  const scriptBlock = scripts
    .map((s) => `<!--PRESTO:SCRIPT:BEGIN-->${s}<!--PRESTO:SCRIPT:END-->`)
    .join("\n");

  const bodyClose = content.lastIndexOf("</body>");
  if (bodyClose !== -1) {
    return content.substring(0, bodyClose) + "\n" + scriptBlock + "\n" + content.substring(bodyClose);
  }
  return content + "\n" + scriptBlock;
}

// Stage 22: Replace PRESTO:SCRIPT placeholders with <script> tags
export function finalizeScripts(content: string): string {
  return content
    .replace(/<!--PRESTO:SCRIPT:BEGIN-->/g, "<script>")
    .replace(/<!--PRESTO:SCRIPT:END-->/g, "</script>");
}
