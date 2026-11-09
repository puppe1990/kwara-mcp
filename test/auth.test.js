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
