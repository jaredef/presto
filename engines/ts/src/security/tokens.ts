// PRESTO-TS v3 — Token Services (Action + Channel + Signed URLs)
// C3 Grants, C4 Mutations — HMAC-SHA256 signed, constant-time verified

import { tokenSign, tokenVerify } from "./hmac";

export interface ActionTokenPayload {
  action: string;
  type: string;
  recordId: string;
  sub: string;
  scope: string;
  fp: string;
  jti: string;
}

export class ActionTokenService {
  constructor(private secret: string, private ttl = 3600) {} // 1 hour default

  async issue(
    action: string,
    type: string,
    recordId?: string,
    options?: { sub?: string; fingerprint?: string; ttl?: number },
  ): Promise<string> {
    return tokenSign(
      {
        action,
        type,
        recordId: recordId || "",
        sub: options?.sub || "",
        scope: `action:${type}:${action}`,
        fp: options?.fingerprint || "",
        jti: crypto.randomUUID(),
        exp: Math.floor(Date.now() / 1000) + (options?.ttl || this.ttl),
      },
      this.secret,
    );
  }

  async verify(
    token: string,
    options?: { sub?: string; fingerprint?: string },
  ): Promise<ActionTokenPayload | null> {
    const payload = await tokenVerify(token, this.secret);
    if (!payload) return null;

    const result: ActionTokenPayload = {
      action: payload.action as string,
      type: payload.type as string,
      recordId: payload.recordId as string,
      sub: payload.sub as string,
      scope: payload.scope as string,
      fp: payload.fp as string,
      jti: payload.jti as string,
    };

    // Identity binding: if sub is present in token, verify it matches the requesting user
    if (result.sub && options?.sub && result.sub !== options.sub) {
      return null;
    }

    // Fingerprint binding: if fp is present in token, verify it matches the request context
    if (result.fp && options?.fingerprint && result.fp !== options.fingerprint) {
      return null;
    }

    return result;
  }
}

export class ChannelTokenService {
  constructor(private secret: string, private ttl = 120) {} // 120 seconds default

  async issue(userId: string, scope: string): Promise<string> {
    return tokenSign(
      {
        sub: userId,
        scope,
        exp: Math.floor(Date.now() / 1000) + this.ttl,
        jti: crypto.randomUUID(),
      },
      this.secret,
    );
  }

  async verify(token: string): Promise<{ sub: string; scope: string } | null> {
    const payload = await tokenVerify(token, this.secret);
    if (!payload) return null;
    return {
      sub: payload.sub as string,
      scope: payload.scope as string,
    };
  }
}

export class SignedUrlService {
  constructor(private secret: string, private ttl = 3600) {}

  async sign(path: string): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + this.ttl;
    const { hmacSign } = await import("./hmac");
    const sig = await hmacSign(`${path}:${exp}`, this.secret);
    return `${path}?sig=${sig}&exp=${exp}`;
  }

  async verify(path: string, sig: string, exp: string): Promise<boolean> {
    const expNum = parseInt(exp, 10);
    if (isNaN(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;
    const { hmacSign, constantTimeEqual } = await import("./hmac");
    const expected = await hmacSign(`${path}:${exp}`, this.secret);
    return constantTimeEqual(sig, expected);
  }
}
