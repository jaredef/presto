// Static file serving: binary files must come back byte-for-byte.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrestoEngine } from "../../src/engine";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import type { HtxRequest } from "../../src/types";

const TEMPLATES = join(import.meta.dir, "../../templates");
let PUBLIC: string;
let engine: PrestoEngine;

// Not valid UTF-8 (JPEG/PNG signatures, NUL, lone continuation bytes): a text round-trip mangles these.
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x89, 0x50, 0x4e, 0x47, 0x80, 0xc3, 0x28, 0xfe]);

function get(path: string): HtxRequest {
  return { method: "GET", path, query: {}, headers: {}, cookies: {}, body: {}, bodyRaw: "", contentType: "", hxRequest: false, auth: null };
}

beforeAll(() => {
  PUBLIC = mkdtempSync(join(tmpdir(), "presto-static-"));
  writeFileSync(join(PUBLIC, "photo.jpg"), BYTES);
  writeFileSync(join(PUBLIC, "PHOTO.JPG"), BYTES);
  writeFileSync(join(PUBLIC, "site.css"), "body { color: #111; }");
  engine = new PrestoEngine({ templateDir: TEMPLATES, publicDir: PUBLIC, secret: "static-test-secret" });
});

afterAll(() => rmSync(PUBLIC, { recursive: true, force: true }));

describe("static file serving", () => {
  test("binary files are served byte-for-byte", async () => {
    const resp = await engine.handle(get("/photo.jpg"));
    expect(resp.status).toBe(200);
    expect(resp.contentType).toBe("image/jpeg");
    expect(resp.body).toBeInstanceOf(Uint8Array);
    expect(Array.from(resp.body as Uint8Array)).toEqual(Array.from(BYTES));
  });

  test("body survives the trip through a web Response", async () => {
    const resp = await engine.handle(get("/photo.jpg"));
    const bytes = new Uint8Array(await new Response(resp.body).arrayBuffer());
    expect(bytes.length).toBe(BYTES.length);
    expect(Array.from(bytes)).toEqual(Array.from(BYTES));
  });

  test("extension lookup is case-insensitive", async () => {
    const resp = await engine.handle(get("/PHOTO.JPG"));
    expect(resp.contentType).toBe("image/jpeg");
  });

  test("text files still decode to their content", async () => {
    const resp = await engine.handle(get("/site.css"));
    expect(resp.contentType).toBe("text/css");
    expect(await new Response(resp.body).text()).toBe("body { color: #111; }");
  });
});
