// Concurrency benchmark — parallel requests to test module thread safety

const PORT = 4030;
const CONCURRENCY = [1, 5, 10, 25, 50];
const REQUESTS_PER_LEVEL = 200;

async function benchConcurrent(concurrency: number, path: string): Promise<{ rps: number; avgMs: number; errors: number }> {
  // Warmup
  for (let i = 0; i < 10; i++) await fetch(`http://localhost:${PORT}${path}`);

  const start = performance.now();
  let completed = 0;
  let errors = 0;
  const latencies: number[] = [];

  const workers = Array.from({ length: concurrency }, async () => {
    const perWorker = Math.ceil(REQUESTS_PER_LEVEL / concurrency);
    for (let i = 0; i < perWorker; i++) {
      const s = performance.now();
      try {
        const resp = await fetch(`http://localhost:${PORT}${path}`);
        await resp.text();
        if (resp.status >= 400) errors++;
      } catch { errors++; }
      latencies.push(performance.now() - s);
      completed++;
    }
  });

  await Promise.all(workers);
  const totalMs = performance.now() - start;
  latencies.sort((a, b) => a - b);

  return {
    rps: Math.round((completed / totalMs) * 1000),
    avgMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    errors,
  };
}

async function main() {
  console.log(`\n  Concurrency Benchmark — 12 modules loaded\n`);

  for (const path of ["/", "/blog", "/blog/hello-world", "/healthz"]) {
    console.log(`  ${path}`);
    console.log(`  ${"Conc".padEnd(8)} ${"req/s".padEnd(10)} ${"avg ms".padEnd(10)} errors`);
    for (const c of CONCURRENCY) {
      const r = await benchConcurrent(c, path);
      console.log(`  ${String(c).padEnd(8)} ${String(r.rps).padEnd(10)} ${r.avgMs.toFixed(2).padEnd(10)} ${r.errors}`);
    }
    console.log();
  }

  // Memory after all tests
  const healthResp = await fetch(`http://localhost:${PORT}/healthz`);
  const health = await healthResp.json() as any;
  console.log(`  Memory after benchmark: ${health.memory.rss}MB RSS, ${health.memory.heap}MB heap`);
  console.log(`  Uptime: ${health.uptime}s\n`);
}

main();
