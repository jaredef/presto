import type { ScaffoldOptions } from "../scaffold";

export function generateLayout(options: ScaffoldOptions): string {
  const authNav = options.auth ? `
      <htx:auth>
        <span><htx:v>auth.user.name</htx:v></span>
        <a href="/logout">Logout</a>
      </htx:auth>
      <htx:unauth>
        <a href="/login">Login</a>
      </htx:unauth>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${options.name}</title>
  <link rel="stylesheet" href="/css/presto-ui.css">
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>
  <header class="app-header">
    <nav class="app-nav">
      <a href="/" class="app-logo">${options.name}</a>
      <div class="app-nav-links">
        <a href="/">Home</a>${options.examples ? '\n        <a href="/blog">Blog</a>\n        <a href="/about">About</a>' : ""}${authNav}
      </div>
    </nav>
  </header>
  <main class="app-main">
    __content__
  </main>
  <footer class="app-footer">
    Built with <a href="https://hypermediaapp.org">Hypermedia App</a>
  </footer>
  <script src="/js/presto-signals.js"></script>
</body>
</html>
`;
}
