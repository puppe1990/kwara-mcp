import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { homedir } from "node:os";

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
