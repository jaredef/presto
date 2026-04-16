// Verification under load — confirms all 12 modules are functioning correctly
// after sustained traffic

import { tokenSign } from "../src/security/hmac";

const PORT = 4030;
const SECRET = "demo-app-secret-key";
let pass = 0;
let fail = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
  } else {
    fail++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log(`\n  Module Verification Under Load\n`);

  // Hammer the server first
  console.log("  Warming up with 100 concurrent requests...");
  await Promise.all(Array.from({ length: 100 }, () => fetch(`http://localhost:${PORT}/`).then(r => r.text())));
  console.log("  Done. Now verifying each module:\n");

  // 1. Request ID — unique per request
  const r1 = await fetch(`http://localhost:${PORT}/`);
  const r2 = await fetch(`http://localhost:${PORT}/`);
  const id1 = r1.headers.get("x-request-id");
  const id2 = r2.headers.get("x-request-id");
  await r1.text(); await r2.text();
  assert("Request ID: present", !!id1);
  assert("Request ID: unique", id1 !== id2);
  assert("Request ID: UUID format", /^[0-9a-f]{8}-/.test(id1 || ""));

  // 2. Logger — (can't verify from client, just confirm no crash)
  assert("Logger: server still responding", (await fetch(`http://localhost:${PORT}/`)).ok);
  await (await fetch(`http://localhost:${PORT}/`)).text();

  // 3. CORS
  const corsResp = await fetch(`http://localhost:${PORT}/`);
  const corsBody = await corsResp.text();
  assert("CORS: Access-Control-Allow-Origin", corsResp.headers.get("access-control-allow-origin") === "*");
  assert("CORS: Access-Control-Allow-Methods", (corsResp.headers.get("access-control-allow-methods") || "").includes("GET"));

  // 4. CORS Preflight
  const preflight = await fetch(`http://localhost:${PORT}/`, { method: "OPTIONS" });
  await preflight.text();
  assert("CORS: OPTIONS returns 204", preflight.status === 204);
  assert("CORS: Max-Age on preflight", preflight.headers.get("access-control-max-age") === "86400");

  // 5. Security Headers
  const secResp = await fetch(`http://localhost:${PORT}/blog`);
  await secResp.text();
  assert("Security: X-Content-Type-Options", secResp.headers.get("x-content-type-options") === "nosniff");
  assert("Security: X-Frame-Options", secResp.headers.get("x-frame-options") === "DENY");
  assert("Security: Referrer-Policy", secResp.headers.get("referrer-policy") === "strict-origin-when-cross-origin");
  assert("Security: X-XSS-Protection", secResp.headers.get("x-xss-protection") === "0");

  // 6. Rate Limit Headers
  const rlResp = await fetch(`http://localhost:${PORT}/`);
  await rlResp.text();
  assert("Rate Limit: X-RateLimit-Limit", rlResp.headers.get("x-ratelimit-limit") === "50000");
  assert("Rate Limit: X-RateLimit-Remaining present", !!rlResp.headers.get("x-ratelimit-remaining"));
  assert("Rate Limit: X-RateLimit-Reset present", !!rlResp.headers.get("x-ratelimit-reset"));

  // 7. Cache — ETag
  const cacheResp = await fetch(`http://localhost:${PORT}/blog`);
  const etag = cacheResp.headers.get("etag");
  await cacheResp.text();
  assert("Cache: ETag present", !!etag);
  assert("Cache: ETag format", /^"[0-9a-f]+"$/.test(etag || ""));

  // 8. Cache — 304
  const condResp = await fetch(`http://localhost:${PORT}/blog`, { headers: { "If-None-Match": etag! } });
  await condResp.text();
  assert("Cache: 304 on matching ETag", condResp.status === 304);

  // 9. Session — decode cookie
  const sessionToken = await tokenSign({ name: "bench", exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
  const sessionResp = await fetch(`http://localhost:${PORT}/`, { headers: { Cookie: `htx_session=${sessionToken}` } });
  const sessionBody = await sessionResp.text();
  // Session module decodes but auth module is separate — session data in context
  assert("Session: request processed with cookie", sessionResp.ok);

  // 10. Auth — unauthenticated
  const unauthResp = await fetch(`http://localhost:${PORT}/`);
  const unauthBody = await unauthResp.text();
  assert("Auth: unauthenticated shows Guest", unauthBody.includes("Guest"));
  assert("Auth: unauthenticated hides user badge", !unauthBody.includes("auth-badge user"));

  // 11. Auth — authenticated
  const authToken = await tokenSign({
    sub: "99", username: "benchmark", role: "tester",
    exp: Math.floor(Date.now() / 1000) + 3600,
  }, SECRET);
  const authResp = await fetch(`http://localhost:${PORT}/`, { headers: { Cookie: `htx_session=${authToken}` } });
  const authBody = await authResp.text();
  assert("Auth: authenticated shows username", authBody.includes("benchmark"));
  assert("Auth: authenticated shows role", authBody.includes("tester"));
  assert("Auth: htx:unauth hidden for auth users", !authBody.includes('>Guest<'));

  // 12. Health Check
  const healthResp = await fetch(`http://localhost:${PORT}/healthz`);
  const health = await healthResp.json() as any;
  assert("Health: status ok", health.status === "ok");
  assert("Health: uptime present", health.uptime >= 0);
  assert("Health: memory present", health.memory.rss > 0);
  assert("Health: database check passes", health.checks[0]?.status === "ok");

  // 13. Static Assets context provider
  const homeResp = await fetch(`http://localhost:${PORT}/`);
  const homeBody = await homeResp.text();
  assert("Static Assets: presto-ui.css loads", (await fetch(`http://localhost:${PORT}/css/presto-ui.css`)).ok);
  assert("Static Assets: presto-signals.js loads", (await fetch(`http://localhost:${PORT}/js/presto-signals.js`)).ok);

  // 14. Error Handler — 404
  const notFound = await fetch(`http://localhost:${PORT}/this-does-not-exist`);
  await notFound.text();
  assert("Error Handler: 404 for missing route", notFound.status === 404);

  // 15. Pipeline correctness — data rendered
  const blogResp = await fetch(`http://localhost:${PORT}/blog`);
  const blogBody = await blogResp.text();
  assert("Pipeline: htx:data resolves posts", blogBody.includes("Hello World"));
  assert("Pipeline: htx:each iterates", blogBody.includes("Module Kit"));
  assert("Pipeline: components render", blogBody.includes("ui-card"));
  assert("Pipeline: no htx: directives leak", !/<htx:(data|each|component|v|if|grant)\b/.test(blogBody));

  // 16. Dynamic route
  const slugResp = await fetch(`http://localhost:${PORT}/blog/progressive-escape`);
  const slugBody = await slugResp.text();
  assert("Dynamic Route: [slug] resolves", slugBody.includes("Progressive Escape"));

  // 17. Mutation token
  const formResp = await fetch(`http://localhost:${PORT}/`);
  const formBody = await formResp.text();
  const tokenMatch = formBody.match(/value="(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)"/);
  assert("Mutation: action token present in form", !!tokenMatch);

  // 18. Header count
  const allHeaders = [...(await fetch(`http://localhost:${PORT}/blog`)).headers.entries()];
  const moduleHeaders = allHeaders.filter(([k]) =>
    k.startsWith("x-request-id") || k.startsWith("x-content-type") || k.startsWith("x-frame") ||
    k.startsWith("x-xss") || k.startsWith("referrer") || k.startsWith("access-control") ||
    k.startsWith("x-ratelimit") || k.startsWith("etag")
  );
  assert(`Module Headers: ${moduleHeaders.length} module-added headers on response`, moduleHeaders.length >= 10);

  // Summary
  console.log(`\n  ══════════════════════════════════════════════`);
  console.log(`  ${pass} passed, ${fail} failed out of ${pass + fail} checks`);
  if (fail === 0) console.log(`  \x1b[32mAll modules verified under load.\x1b[0m`);
  else console.log(`  \x1b[31m${fail} failures detected.\x1b[0m`);
  console.log();
}

main();
