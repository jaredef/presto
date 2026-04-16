// Hypermedia App — Dev Error Page
// Renders clear error pages with stack traces in dev mode

export function renderDevError(error: Error, path: string): string {
  const stack = (error.stack || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const message = (error.message || "Unknown error").replace(/</g, "&lt;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error — ${message}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; background: #1a1a2e; color: #eee; }
  .err { max-width: 800px; margin: 0 auto; }
  h1 { color: #ef4444; font-size: 1.5rem; margin: 0 0 0.5rem; }
  .path { color: #888; font-size: 0.9rem; margin-bottom: 1.5rem; }
  .msg { background: #2a2a3e; padding: 1rem 1.25rem; border-radius: 8px; border-left: 3px solid #ef4444; font-size: 0.95rem; margin-bottom: 1.5rem; }
  .stack { background: #111; padding: 1rem; border-radius: 8px; font-family: monospace; font-size: 0.8rem; white-space: pre-wrap; color: #aaa; overflow-x: auto; line-height: 1.6; }
  .hint { margin-top: 1.5rem; padding: 1rem; background: #2a2a3e; border-radius: 8px; border-left: 3px solid #3b82f6; font-size: 0.85rem; color: #bbb; }
  .hint a { color: #6366f1; }
</style>
</head>
<body>
<div class="err">
  <h1>Pipeline Error</h1>
  <div class="path">${path}</div>
  <div class="msg">${message}</div>
  <div class="stack">${stack}</div>
  <div class="hint">
    This error page is only shown in dev mode. In production, your _500.htx template is served instead.
  </div>
</div>
</body>
</html>`;
}
