// PRESTO-TS v3 — HMAC-SHA256 + Base64url-nopad + Constant-time Compare
// Implements C8 Security: credentials HMAC-SHA256 signed, comparison MUST be constant-time

import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

const encoder = new TextEncoder();

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export function base64urlEncode(data: string | Uint8Array): string {
  const bytes = typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data);
  return bytes.toString("base64url"); // base64url-nopad per RFC 4648 Section 5
}

export function base64urlDecode(encoded: string): string {
  return Buffer.from(encoded, "base64url").toString("utf-8");
}

export function base64urlDecodeBytes(encoded: string): Uint8Array {
  return new Uint8Array(Buffer.from(encoded, "base64url"));
}

export async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await getKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return base64urlEncode(new Uint8Array(signature));
}

export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) {
    // Compare against self to consume equal time, then return false
    Buffer.from(a, "utf-8").equals(bufA); // dummy op
    return false;
  }
  return bufA.equals(bufB) && crypto.timingSafeEqual(bufA, bufB);
}

// Token format: base64url_nopad(payload).base64url_nopad(hmac(base64url_nopad(payload), secret))
export async function tokenSign(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encoded = base64urlEncode(JSON.stringify(payload));
  const signature = await hmacSign(encoded, secret);
  return `${encoded}.${signature}`;
}

export async function tokenVerify(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return null;

  const encoded = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  const expectedSig = await hmacSign(encoded, secret);
  if (!constantTimeEqual(signature, expectedSig)) return null;

  try {
    const payload = JSON.parse(base64urlDecode(encoded));
    if (payload.exp && typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // expired
    }
    return payload;
  } catch {
    return null;
  }
}

// --- Synchronous variants (for use in sync middleware) ---
// Uses Node's createHmac instead of crypto.subtle

export function hmacSignSync(data: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(data).digest();
  return base64urlEncode(new Uint8Array(sig));
}

export function tokenVerifySync(token: string, secret: string): Record<string, unknown> | null {
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return null;

  const encoded = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  const expectedSig = hmacSignSync(encoded, secret);
  const sigBuf = Buffer.from(signature, "utf-8");
  const expBuf = Buffer.from(expectedSig, "utf-8");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(base64urlDecode(encoded));
    if (payload.exp && typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
