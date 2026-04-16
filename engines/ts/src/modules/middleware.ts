// PRESTO-TS v3 — Middleware Chain
// C2: Middleware MUST execute in registration order

import type { HtxRequest, HtxResponse, Middleware } from "../types";

export function executeMiddleware(
  chain: Middleware[],
  request: HtxRequest,
  finalHandler: () => HtxResponse,
): HtxResponse {
  if (chain.length === 0) return finalHandler();

  let index = 0;

  function next(): HtxResponse {
    if (index >= chain.length) return finalHandler();
    const mw = chain[index++];
    return mw.handle(request, next);
  }

  return next();
}
