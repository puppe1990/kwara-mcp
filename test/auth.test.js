import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadRefreshToken,
  persistRotatedRefresh,
  MISSING_REFRESH_MESSAGE,
  userIdFromAccess,
  refreshAccess,
  REJECTED_REFRESH_PREFIX,
} from "../src/auth.js";
import { fakeJwt } from "./factories.js";

test("userIdFromAccess reads id and ignores buyerId", () => {
  const token = fakeJwt({ id: "111", buyerId: "999", type: "access" });
  assert.equal(userIdFromAccess(token), "111");
});

test("loadRefreshToken prefers the config file over env", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kwara-mcp-"));
  const configPath = join(dir, "config.json");
  await persistRotatedRefresh(configPath, "file-token", "2027-01-01T00:00:00.000Z");
  const loaded = await loadRefreshToken({
    configPath,
    env: { KWARA_REFRESH_TOKEN: "env-token" },
  });
  assert.equal(loaded, "file-token");
});

test("loadRefreshToken falls back to env", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kwara-mcp-"));
  const loaded = await loadRefreshToken({
    configPath: join(dir, "missing.json"),
    env: { KWARA_REFRESH_TOKEN: "env-token" },
  });
  assert.equal(loaded, "env-token");
});

test("loadRefreshToken throws the configure message when missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kwara-mcp-"));
  await assert.rejects(
    () => loadRefreshToken({ configPath: join(dir, "missing.json"), env: {} }),
    (error) => error.message === MISSING_REFRESH_MESSAGE,
  );
});

test("persistRotatedRefresh writes 0600 JSON without accessToken", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kwara-mcp-"));
  const configPath = join(dir, "config.json");
  await persistRotatedRefresh(configPath, "rotated", "2027-05-08T13:10:45.000+00:00");
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw);
  assert.deepEqual(parsed, {
    refreshToken: "rotated",
    refreshTokenExpiresAt: "2027-05-08T13:10:45.000+00:00",
  });
  assert.equal(Object.hasOwn(parsed, "accessToken"), false);
  const { stat } = await import("node:fs/promises");
  const mode = (await stat(configPath)).mode & 0o777;
  assert.equal(mode, 0o600);
});

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name === "content-type" ? "application/json" : null) },
    json: async () => body,
  };
}

test("refreshAccess tries Bearer then cookie and persists rotation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kwara-mcp-"));
  const configPath = join(dir, "config.json");
  const access = fakeJwt({ type: "access", id: "111", buyerId: "999" });
  const rotated = fakeJwt({ type: "refresh", id: "111", buyerId: "999" });
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(init.headers);
    if (init.headers.Authorization) {
      return jsonResponse(401, { error: "nope" });
    }
    return jsonResponse(200, {
      accessToken: access,
      refreshToken: rotated,
      accessTokenExpiresAt: "2026-11-09T13:25:45.000+00:00",
      refreshTokenExpiresAt: "2027-05-08T13:10:45.000+00:00",
    });
  };
  const session = await refreshAccess({
    refreshToken: "old-refresh",
    fetchImpl,
    configPath,
  });
  assert.equal(session.accessToken, access);
  assert.equal(session.userId, "111");
  assert.equal(session.method, "cookie");
  assert.equal(calls[0].Authorization, "Bearer old-refresh");
  assert.match(calls[1].Cookie, /__Secure-auth\.kat=old-refresh/);
  const saved = JSON.parse(await readFile(configPath, "utf8"));
  assert.equal(saved.refreshToken, rotated);
});

test("refreshAccess stops at first 200 Bearer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kwara-mcp-"));
  const access = fakeJwt({ type: "access", id: "5", buyerId: "9" });
  let cookieCalls = 0;
  const fetchImpl = async (_url, init) => {
    if (init.headers.Cookie) cookieCalls += 1;
    return jsonResponse(200, {
      accessToken: access,
      refreshToken: "next",
      accessTokenExpiresAt: "2026-11-09T13:25:45.000+00:00",
      refreshTokenExpiresAt: "2027-05-08T13:10:45.000+00:00",
    });
  };
  const session = await refreshAccess({
    refreshToken: "seed",
    fetchImpl,
    configPath: join(dir, "config.json"),
  });
  assert.equal(session.method, "bearer");
  assert.equal(cookieCalls, 0);
});

test("refreshAccess surfaces rejected message without body", async () => {
  const fetchImpl = async () => jsonResponse(401, { accessToken: "secret" });
  await assert.rejects(
    () => refreshAccess({ refreshToken: "x", fetchImpl, configPath: join(tmpdir(), "nope.json") }),
    (error) => {
      assert.match(error.message, new RegExp(REJECTED_REFRESH_PREFIX));
      assert.match(error.message, /HTTP 401/);
      assert.doesNotMatch(error.message, /secret/);
      return true;
    },
  );
});
