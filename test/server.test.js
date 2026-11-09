import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import readline from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { TOOLS, buildTools, createServer } from "../src/index.js";
import { fakeJwt, fakeLot } from "./factories.js";

const serverPath = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "index.js");

function startServer() {
  const child = spawn(process.execPath, [serverPath], { stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map();
  let stderr = "";
  let nextId = 0;

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    const resolve = pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message);
    }
  });

  return {
    get stderr() {
      return stderr;
    },

    request(method, params) {
      const id = ++nextId;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    },

    notify(method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    },

    async close() {
      if (child.exitCode === null) {
        child.kill();
        await once(child, "exit");
      }
    },
  };
}

test("createServer registers the three Kwara tools", () => {
  assert.equal(typeof createServer, "function");
  assert.deepEqual(
    TOOLS.map((tool) => tool.name),
    ["kwara_search", "kwara_lot", "kwara_favorites"],
  );
});

test("the server answers initialize and lists the three tools over stdio", async (t) => {
  const server = startServer();
  t.after(() => server.close());

  const init = await server.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "kwara-mcp-tests", version: "1.0.0" },
  });
  assert.equal(init.result?.serverInfo?.name, "kwara");
  server.notify("notifications/initialized", {});
  const list = await server.request("tools/list", {});
  assert.deepEqual(
    list.result?.tools?.map((tool) => tool.name),
    ["kwara_search", "kwara_lot", "kwara_favorites"],
  );
  assert.match(server.stderr, /running on stdio/);
});

test("buildTools reuses one auth session across kwara_favorites calls", async () => {
  const access = fakeJwt({ id: "111", buyerId: "999", type: "access" });
  const refresh = fakeJwt({ id: "111", buyerId: "999", type: "refresh" });
  const dir = await mkdtemp(join(tmpdir(), "kwara-mcp-"));
  const configPath = join(dir, "config.json");
  let refreshCalls = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes("/auth/refresh-token")) {
      refreshCalls += 1;
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          accessToken: access,
          refreshToken: refresh,
          accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          refreshTokenExpiresAt: "2027-01-01T00:00:00.000Z",
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ items: [fakeLot({ id: "21", slug: "x-21" })], totalItems: 1 }),
    };
  };
  const tools = buildTools({ fetchImpl, configPath, env: { KWARA_REFRESH_TOKEN: refresh } });
  const favorites = tools.find((tool) => tool.name === "kwara_favorites");
  const first = await favorites.run({ take: 20, skip: 0, onlyActiveItems: true });
  const second = await favorites.run({ take: 20, skip: 0, onlyActiveItems: true });
  assert.equal(refreshCalls, 1);
  assert.equal(first.items[0].id, "21");
  assert.equal(second.items[0].id, "21");
});
