import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { API_ORIGIN } from "./lots.js";
import { KwaraHttpError, kwaraFetch } from "./client.js";

export const MISSING_REFRESH_MESSAGE =
  "configure KWARA_REFRESH_TOKEN ou ~/.config/kwara/config.json";

export function decodeJwtPayload(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length < 2) return null;
  try {
    const padded = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function userIdFromAccess(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || payload.id == null) return null;
  return String(payload.id);
}

export function defaultConfigPath() {
  return `${homedir()}/.config/kwara/config.json`;
}

export async function persistRotatedRefresh(configPath, refreshToken, refreshTokenExpiresAt) {
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  const payload = { refreshToken, refreshTokenExpiresAt };
  await writeFile(configPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

export async function loadRefreshToken({ configPath, env = process.env } = {}) {
  const path = configPath || env.KWARA_CONFIG_PATH || defaultConfigPath();
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (parsed?.refreshToken) return String(parsed.refreshToken);
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }
  const fromEnv = env.KWARA_REFRESH_TOKEN;
  if (fromEnv) return String(fromEnv);
  throw new Error(MISSING_REFRESH_MESSAGE);
}

export const REJECTED_REFRESH_PREFIX = "refresh rejeitado, cole um token novo";

function rejectedRefresh(status) {
  return new Error(`${REJECTED_REFRESH_PREFIX} (HTTP ${status})`);
}

export async function refreshAccess({
  refreshToken,
  fetchImpl = fetch,
  configPath,
  method = null,
} = {}) {
  const url = `${API_ORIGIN}/auth/refresh-token`;
  const attempts =
    method === "cookie"
      ? [{ name: "cookie", headers: { Cookie: `__Secure-auth.kat=${refreshToken}` } }]
      : method === "bearer"
        ? [{ name: "bearer", headers: { Authorization: `Bearer ${refreshToken}` } }]
        : [
            { name: "bearer", headers: { Authorization: `Bearer ${refreshToken}` } },
            { name: "cookie", headers: { Cookie: `__Secure-auth.kat=${refreshToken}` } },
          ];

  let lastStatus = 0;
  for (const attempt of attempts) {
    try {
      const body = await kwaraFetch(url, { headers: attempt.headers, fetchImpl });
      const accessToken = body.accessToken;
      if (!accessToken) throw rejectedRefresh(200);
      if (body.refreshToken && configPath) {
        await persistRotatedRefresh(configPath, body.refreshToken, body.refreshTokenExpiresAt);
      }
      const expiresAt = body.accessTokenExpiresAt
        ? Date.parse(body.accessTokenExpiresAt)
        : (decodeJwtPayload(accessToken)?.exp ?? 0) * 1000;
      return {
        accessToken,
        userId: userIdFromAccess(accessToken),
        accessExpiresAtMs: expiresAt,
        method: attempt.name,
      };
    } catch (error) {
      if (error instanceof KwaraHttpError) {
        lastStatus = error.status;
        continue;
      }
      throw error;
    }
  }
  throw rejectedRefresh(lastStatus || 401);
}
