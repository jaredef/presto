import { describe, test, expect } from "bun:test";
import { tokenSign, tokenVerify, hmacSign, constantTimeEqual, base64urlEncode, base64urlDecode } from "../../src/security/hmac";

const SECRET = "test-secret-key-for-unit-tests";

describe("HMAC-SHA256", () => {
  test("base64url roundtrip", () => {
    const original = '{"action":"delete","type":"post","recordId":"42"}';
    const encoded = base64urlEncode(original);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
    expect(base64urlDecode(encoded)).toBe(original);
  });

  test("hmacSign produces consistent signatures", async () => {
    const sig1 = await hmacSign("test-data", SECRET);
    const sig2 = await hmacSign("test-data", SECRET);
    expect(sig1).toBe(sig2);
  });

  test("hmacSign produces different signatures for different data", async () => {
    const sig1 = await hmacSign("data-a", SECRET);
    const sig2 = await hmacSign("data-b", SECRET);
    expect(sig1).not.toBe(sig2);
  });

  test("constantTimeEqual returns true for equal strings", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
  });

  test("constantTimeEqual returns false for different strings", () => {
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
  });

  test("constantTimeEqual returns false for different lengths", () => {
    expect(constantTimeEqual("short", "longer-string")).toBe(false);
  });
});

describe("Token sign/verify", () => {
  test("roundtrip succeeds", async () => {
    const payload = { action: "delete", type: "post", recordId: "42", exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = await tokenSign(payload, SECRET);

    expect(token).toContain(".");
    const parts = token.split(".");
    expect(parts).toHaveLength(2);

    const verified = await tokenVerify(token, SECRET);
    expect(verified).not.toBeNull();
    expect(verified!.action).toBe("delete");
    expect(verified!.type).toBe("post");
    expect(verified!.recordId).toBe("42");
  });

  test("tampered token rejected", async () => {
    const payload = { action: "delete", type: "post", exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = await tokenSign(payload, SECRET);

    // Tamper with the payload
    const parts = token.split(".");
    const tampered = base64urlEncode('{"action":"create","type":"admin"}') + "." + parts[1];

    const verified = await tokenVerify(tampered, SECRET);
    expect(verified).toBeNull();
  });

  test("expired token rejected", async () => {
    const payload = { action: "test", exp: Math.floor(Date.now() / 1000) - 60 }; // expired 60s ago
    const token = await tokenSign(payload, SECRET);

    const verified = await tokenVerify(token, SECRET);
    expect(verified).toBeNull();
  });

  test("wrong secret rejected", async () => {
    const payload = { action: "test", exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = await tokenSign(payload, SECRET);

    const verified = await tokenVerify(token, "wrong-secret");
    expect(verified).toBeNull();
  });

  test("malformed token rejected", async () => {
    expect(await tokenVerify("not-a-token", SECRET)).toBeNull();
    expect(await tokenVerify("", SECRET)).toBeNull();
    expect(await tokenVerify("a.b.c", SECRET)).toBeNull();
  });
});
