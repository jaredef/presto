// Hypermedia App — Auth Middleware
// Reads session cookie, verifies, populates request.auth

import type { Middleware, HtxRequest, HtxResponse } from "../../../src/types";
import { verifySession } from "./session";

export class AuthMiddleware implements Middleware {
  constructor(
    private secret: string,
    private cookieName: string,
  ) {}

  name(): string {
    return "auth-session";
  }

  handle(request: HtxRequest, next: () => HtxResponse): HtxResponse {
    const token = request.cookies[this.cookieName];
    if (token) {
      // verifySession is async but middleware is sync — we pre-populate in the context provider instead
      // Store the raw token for the context provider to verify
      (request as any)._sessionToken = token;
    }
    return next();
  }
}
