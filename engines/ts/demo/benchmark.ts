// PRESTO Module Kit — HTTP Benchmark
// Tests throughput and latency with all 12 modules vs bare engine

const ITERATIONS = 500;
const WARMUP = 50;

interface BenchResult {
  name: string;
  port: number;
  path: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p99Ms: number;
  rps: number;
  statusOk: number;
  statusOther: number;
  bodyBytes: number;
  headerCount: number;
}

async function bench(name: string, port: number, path: string, iterations: number, headers: Record<string, string> = {}): Promise<BenchResult> {
  const latencies: number[] = [];
  let statusOk = 0;
  let statusOther = 0;
  let bodyBytes = 0;
  let headerCount = 0;

  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    await fetch(`http://localhost:${port}${path}`, { headers });
  }

  // Benchmark
  const totalStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const resp = await fetch(`http://localhost:${port}${path}`, { headers });
    const elapsed = performance.now() - start;
    latencies.push(elapsed);

    if (resp.status >= 200 && resp.status < 400) statusOk++;
    else statusOther++;

    const body = await resp.text();
    if (i === 0) {
      bodyBytes = body.length;
      headerCount = [...resp.headers.entries()].length;
    }
  }
  const totalMs = performance.now() - totalStart;

  latencies.sort((a, b) => a - b);
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  return {
    name,
    port,
    path,
    iterations,
    totalMs,
    avgMs: avg,
    minMs: latencies[0],
    maxMs: latencies[latencies.length - 1],
    p99Ms: p99,
    rps: Math.round((iterations / totalMs) * 1000),
    statusOk,
    statusOther,
    bodyBytes,
    headerCount,
  };
}

function printResult(r: BenchResult) {
  console.log(`  ${r.name}`);
  console.log(`    ${r.rps} req/s | avg ${r.avgMs.toFixed(2)}ms | min ${r.minMs.toFixed(2)}ms | max ${r.maxMs.toFixed(2)}ms | p99 ${r.p99Ms.toFixed(2)}ms`);
  console.log(`    ${r.statusOk}/${r.iterations} ok | ${r.bodyBytes} bytes | ${r.headerCount} headers`);
  console.log();
}

async function main() {
  console.log(`\n  PRESTO Module Kit Benchmark`);
  console.log(`  ${ITERATIONS} requests per test, ${WARMUP} warmup\n`);

  // Test 1: Home page — full pipeline with data + components + modules
  console.log("  === Home Page (data + components + all 12 modules) ===\n");
  const homeModules = await bench("12 modules (port 4030)", 4030, "/", ITERATIONS);
  printResult(homeModules);
  const homeBare = await bench("Bare engine (port 4031)", 4031, "/", ITERATIONS);
  printResult(homeBare);
  const homeOverhead = ((homeModules.avgMs - homeBare.avgMs) / homeBare.avgMs * 100).toFixed(1);
  console.log(`  Module overhead: ${homeOverhead}% (${(homeModules.avgMs - homeBare.avgMs).toFixed(2)}ms per request)\n`);

  // Test 2: Blog list — data + each + components
  console.log("  === Blog List (htx:data + htx:each + cards) ===\n");
  const blogModules = await bench("12 modules", 4030, "/blog", ITERATIONS);
  printResult(blogModules);
  const blogBare = await bench("Bare engine", 4031, "/blog", ITERATIONS);
  printResult(blogBare);
  const blogOverhead = ((blogModules.avgMs - blogBare.avgMs) / blogBare.avgMs * 100).toFixed(1);
  console.log(`  Module overhead: ${blogOverhead}% (${(blogModules.avgMs - blogBare.avgMs).toFixed(2)}ms per request)\n`);

  // Test 3: Dynamic route — slug lookup
  console.log("  === Dynamic Route (blog/[slug]) ===\n");
  const slugModules = await bench("12 modules", 4030, "/blog/hello-world", ITERATIONS);
  printResult(slugModules);
  const slugBare = await bench("Bare engine", 4031, "/blog/hello-world", ITERATIONS);
  printResult(slugBare);
  const slugOverhead = ((slugModules.avgMs - slugBare.avgMs) / slugBare.avgMs * 100).toFixed(1);
  console.log(`  Module overhead: ${slugOverhead}% (${(slugModules.avgMs - slugBare.avgMs).toFixed(2)}ms per request)\n`);

  // Test 4: Health endpoint — module-only (no pipeline)
  console.log("  === Health Check (module short-circuit, no pipeline) ===\n");
  const health = await bench("/healthz", 4030, "/healthz", ITERATIONS);
  printResult(health);

  // Test 5: 304 conditional — ETag cache hit
  console.log("  === ETag 304 (conditional cache hit) ===\n");
  // Get ETag first
  const firstResp = await fetch("http://localhost:4030/blog");
  const etag = firstResp.headers.get("etag") || "";
  await firstResp.text();
  const cached = await bench("304 with ETag", 4030, "/blog", ITERATIONS, { "If-None-Match": etag });
  printResult(cached);

  // Test 6: Static file
  console.log("  === Static CSS File ===\n");
  const cssModules = await bench("12 modules", 4030, "/css/presto-ui.css", ITERATIONS);
  printResult(cssModules);
  const cssBare = await bench("Bare engine", 4031, "/css/presto-ui.css", ITERATIONS);
  printResult(cssBare);

  // Summary
  console.log("  ══════════════════════════════════════════════");
  console.log("  SUMMARY\n");
  console.log(`  Home page:     ${homeModules.rps} req/s (modules) vs ${homeBare.rps} req/s (bare) — ${homeOverhead}% overhead`);
  console.log(`  Blog list:     ${blogModules.rps} req/s (modules) vs ${blogBare.rps} req/s (bare) — ${blogOverhead}% overhead`);
  console.log(`  Dynamic route: ${slugModules.rps} req/s (modules) vs ${slugBare.rps} req/s (bare) — ${slugOverhead}% overhead`);
  console.log(`  Health check:  ${health.rps} req/s (short-circuit)`);
  console.log(`  ETag 304:      ${cached.rps} req/s (conditional)`);
  console.log(`  Static CSS:    ${cssModules.rps} req/s (modules) vs ${cssBare.rps} req/s (bare)`);

  const avgOverhead = ((parseFloat(homeOverhead) + parseFloat(blogOverhead) + parseFloat(slugOverhead)) / 3).toFixed(1);
  console.log(`\n  Average module overhead across template routes: ${avgOverhead}%`);
  console.log(`  Headers added per response: ${homeModules.headerCount - homeBare.headerCount} (from 12 modules)\n`);
}

main();
