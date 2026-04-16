// Layer 3-4 component tests — verify grant materialization + script extraction

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrestoEngine } from "../../src/engine";
import { SqliteAdapter } from "../../src/adapters/sqlite";
import { join } from "node:path";
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import type { HtxRequest, HtxModule, ChannelHandler } from "../../src/types";

const TEMPLATES = join(import.meta.dir, "../../templates");
const PUBLIC = join(import.meta.dir, "../../public");
const DB_PATH = join(import.meta.dir, "layer34-test.sqlite");
const SECRET = "layer34-test-secret";
const TEST_DIR = join(TEMPLATES, "test-l34");

let adapter: SqliteAdapter;
let engine: PrestoEngine;

function req(path: string): HtxRequest {
  return { method: "GET", path, query: {}, headers: {}, cookies: {}, body: {}, bodyRaw: "", contentType: "", hxRequest: false, auth: null };
}

const feedHandler: ChannelHandler = {
  module: () => "feed",
  handle: () => ({ status: 200, data: { message: "ok" } }),
};
const presenceHandler: ChannelHandler = {
  module: () => "presence",
  handle: () => ({ status: 200, data: { count: 1 } }),
};
const counterHandler: ChannelHandler = {
  module: () => "counter",
  handle: () => ({ status: 200, data: { value: 42 } }),
};
const collabHandler: ChannelHandler = {
  module: () => "collab",
  handle: () => ({ status: 200, data: { users: [] } }),
};

const channelModule: HtxModule = {
  name: () => "channel-test-module",
  manifest: () => ({
    trust: "first-party" as const,
    channelHandlers: ["feed", "presence", "counter", "collab"],
  }),
  boot: (registry) => {
    registry.registerChannelHandler(feedHandler);
    registry.registerChannelHandler(presenceHandler);
    registry.registerChannelHandler(counterHandler);
    registry.registerChannelHandler(collabHandler);
  },
};

beforeAll(() => {
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  adapter = new SqliteAdapter(DB_PATH);
  engine = new PrestoEngine({ templateDir: TEMPLATES, publicDir: PUBLIC, secret: SECRET, adapter, modules: [channelModule] });

  mkdirSync(TEST_DIR, { recursive: true });

  writeFileSync(join(TEST_DIR, "feed.htx"), `<htx:layout none />
<htx:component src="/ui/live-feed.htx" module="feed" maxItems="25" />`);

  writeFileSync(join(TEST_DIR, "presence.htx"), `<htx:layout none />
<htx:component src="/ui/presence.htx" module="presence" />`);

  writeFileSync(join(TEST_DIR, "counter.htx"), `<htx:layout none />
<htx:component src="/ui/live-counter.htx" module="counter" label="viewers" initial="0" />`);

  writeFileSync(join(TEST_DIR, "collab.htx"), `<htx:layout none />
<htx:component src="/ui/collab-indicator.htx" module="collab" />`);
});

afterAll(() => {
  adapter.close();
  for (const f of [DB_PATH, DB_PATH + "-wal", DB_PATH + "-shm"]) {
    if (existsSync(f)) unlinkSync(f);
  }
  if (existsSync(TEST_DIR)) require("node:fs").rmSync(TEST_DIR, { recursive: true });
});

describe("Layer 3-4 Components — Grant Materialization + Channel Scripts", () => {

  test("LiveFeed: materializes channel token and extracts script", async () => {
    const resp = await engine.handle(req("/test-l34/feed"));
    expect(resp.body).toContain("ui-live-feed");
    // Token should be in hidden input
    expect(resp.body).toMatch(/value="eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"/);
    expect(resp.body).toContain("<script>");
    expect(resp.body).toContain("channel");
    expect(resp.body).toContain("data-max=\"25\"");
  });

  test("PresenceIndicator: materializes token and renders presence UI", async () => {
    const resp = await engine.handle(req("/test-l34/presence"));
    expect(resp.body).toContain("ui-presence");
    expect(resp.body).toMatch(/value="eyJ/);
    expect(resp.body).toContain("ui-presence-count");
    expect(resp.body).toContain("<script>");
  });

  test("LiveCounter: materializes token, renders with signal binding", async () => {
    const resp = await engine.handle(req("/test-l34/counter"));
    expect(resp.body).toContain("ui-live-counter");
    expect(resp.body).toMatch(/value="eyJ/);
    expect(resp.body).toContain("viewers");
    expect(resp.body).toContain("<script>");
    expect(resp.body).toContain("signal"); // Uses signal system
    expect(resp.body).toContain("bind"); // Binds signal to DOM
  });

  test("CollabIndicator: materializes token and renders collab UI", async () => {
    const resp = await engine.handle(req("/test-l34/collab"));
    expect(resp.body).toContain("ui-collab");
    expect(resp.body).toMatch(/value="eyJ/);
    expect(resp.body).toContain("ui-collab-users");
    expect(resp.body).toContain("<script>");
  });

  test("All channel tokens are unique per component", async () => {
    const resp1 = await engine.handle(req("/test-l34/feed"));
    const resp2 = await engine.handle(req("/test-l34/presence"));
    const token1 = resp1.body.match(/value="(eyJ[^"]+)"/)?.[1];
    const token2 = resp2.body.match(/value="(eyJ[^"]+)"/)?.[1];
    expect(token1).toBeDefined();
    expect(token2).toBeDefined();
    expect(token1).not.toBe(token2);
  });

  test("No htx: directives remain in output", async () => {
    for (const p of ["/test-l34/feed", "/test-l34/presence", "/test-l34/counter", "/test-l34/collab"]) {
      const resp = await engine.handle(req(p));
      expect(resp.body).not.toMatch(/<htx:(grant|props|slot|component|script)\b/);
    }
  });
});
