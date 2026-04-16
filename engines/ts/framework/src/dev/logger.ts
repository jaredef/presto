// Hypermedia App — Request Logger Middleware
// Logs: method, path, status, response time

import type { Middleware, HtxRequest, HtxResponse } from "../../../src/types";

export class LoggerMiddleware implements Middleware {
  name(): string {
    return "dev-logger";
  }

  handle(request: HtxRequest, next: () => HtxResponse): HtxResponse {
    const start = performance.now();
    const resp = next();
    const elapsed = (performance.now() - start).toFixed(1);

    const status = resp.status;
    const color = status < 300 ? "\x1b[32m" : status < 400 ? "\x1b[36m" : status < 500 ? "\x1b[33m" : "\x1b[31m";
    const reset = "\x1b[0m";

    console.log(`  ${color}${request.method}${reset} ${request.path} ${color}${status}${reset} ${elapsed}ms`);
    return resp;
  }
}
