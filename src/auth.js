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
