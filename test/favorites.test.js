import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listFavorites } from "../src/favorites.js";
import { KwaraHttpError } from "../src/client.js";
import { fakeJwt, fakeLot } from "./factories.js";
import { persistRotatedRefresh } from "../src/auth.js";

test("listFavorites uses JWT id not buyerId", async () => {
  const access = fakeJwt({ id: "111", buyerId: "999", type: "access" });
  const refresh = fakeJwt({ id: "111", buyerId: "999", type: "refresh" });
  const dir = await mkdtemp(join(tmpdir(), "kwara-mcp-"));
  const configPath = join(dir, "config.json");
  await persistRotatedRefresh(configPath, refresh, "2027-01-01T00:00:00.000Z");
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (String(url).includes("/auth/refresh-token")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          accessToken: access,
          refreshToken: refresh,
          accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          refreshTokenExpiresAt: "2027-01-01T00:00:00.000Z",
        }),
      };
    }
    assert.match(url, /\/web\/users\/111\/favorites/);
    assert.doesNotMatch(url, /999/);
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ items: [fakeLot({ id: "21", slug: "x-21" })], totalItems: 1 }),
    };
  };
  const result = await listFavorites({
    take: 20,
    skip: 0,
    onlyActiveItems: true,
    fetchImpl,
    configPath,
    env: {},
  });
  assert.equal(result.items[0].id, "21");
  assert.equal(result.total, 1);
});

test("listFavorites refreshes once on 401 then retries", async () => {
  const access1 = fakeJwt({ id: "111", buyerId: "999", type: "access" });
  const access2 = fakeJwt({ id: "111", buyerId: "999", type: "access" });
  const refresh = fakeJwt({ id: "111", buyerId: "999", type: "refresh" });
  const dir = await mkdtemp(join(tmpdir(), "kwara-mcp-"));
  const configPath = join(dir, "config.json");
  let favoritesCalls = 0;
  let refreshCalls = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes("/auth/refresh-token")) {
      refreshCalls += 1;
      const access = refreshCalls === 1 ? access1 : access2;
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          accessToken: access,
          refreshToken: refresh,
          accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          refreshTokenExpiresAt: "2027-01-01T00:00:00.000Z",
        }),
      };
    }
    favoritesCalls += 1;
    if (favoritesCalls === 1) {
      return {
        ok: false,
        status: 401,
        headers: { get: () => "application/json" },
        json: async () => ({ error: "expired" }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ favorites: [fakeLot({ id: "22", slug: "y-22" })] }),
    };
  };
  const result = await listFavorites({ fetchImpl, configPath, env: { KWARA_REFRESH_TOKEN: refresh } });
  assert.equal(result.items[0].id, "22");
  assert.equal(refreshCalls, 2);
  assert.equal(favoritesCalls, 2);
});
