// Hypermedia App — HMAC-Signed Cookie Sessions
// Stateless: the token IS the session. No server-side session store.

import { tokenSign, tokenVerify } from "../../../src/security/hmac";

export interface SessionPayload {
  userId: string;
  username: string;
  role: string;
}

export async function createSession(payload: SessionPayload, secret: string, ttl: number): Promise<string> {
  return tokenSign(
    {
      sub: payload.userId,
      username: payload.username,
      role: payload.role,
      exp: Math.floor(Date.now() / 1000) + ttl,
    },
    secret,
  );
}

export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  const payload = await tokenVerify(token, secret);
  if (!payload) return null;
  return {
    userId: payload.sub as string,
    username: payload.username as string,
    role: payload.role as string,
  };
}
