import { API_ORIGIN, compactLot } from "./lots.js";
import { KwaraHttpError, kwaraFetch } from "./client.js";
import { createAuthSession, REJECTED_REFRESH_PREFIX } from "./auth.js";

function clampTake(take) {
  const value = Number(take ?? 20);
  if (!Number.isFinite(value) || value <= 0) return 20;
  return Math.min(50, Math.trunc(value));
}

export function parseFavoritesPayload(payload) {
  const bags = [payload];
  if (payload && typeof payload === "object") {
    bags.push(payload.items, payload.favorites, payload.userFavorites, payload.data, payload.data?.items);
  }
  const list = bags.find((value) => Array.isArray(value)) || [];
  const totalSource = payload && typeof payload === "object" ? payload : {};
  const total = totalSource.totalItems ?? totalSource.total ?? totalSource.data?.totalItems ?? null;
  return {
    items: list.map(compactLot).filter((lot) => lot.id),
    total: total == null ? null : Number(total),
  };
}

export async function listFavorites({
  take = 20,
  skip = 0,
  onlyActiveItems = true,
  fetchImpl,
  configPath,
  env,
  session,
} = {}) {
  const auth = session || createAuthSession({ fetchImpl, configPath, env });
  const limit = clampTake(take);
  const offset = Math.max(0, Number(skip) || 0);
  const active = onlyActiveItems !== false;

  async function getPage(force) {
    const { accessToken, userId } = await auth.getAccess({ force });
    const params = new URLSearchParams({
      take: String(limit),
      skip: String(offset),
      onlyActiveItems: active ? "true" : "false",
    });
    const url = `${API_ORIGIN}/web/users/${encodeURIComponent(userId)}/favorites?${params}`;
    const payload = await kwaraFetch(url, {
      fetchImpl,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return parseFavoritesPayload(payload);
  }

  try {
    return await getPage(false);
  } catch (error) {
    if (error instanceof KwaraHttpError && error.status === 401) {
      try {
        return await getPage(true);
      } catch (retryError) {
        if (retryError instanceof Error && retryError.message.startsWith(REJECTED_REFRESH_PREFIX)) {
          throw retryError;
        }
        const status = retryError instanceof KwaraHttpError ? retryError.status : 401;
        throw new Error(`${REJECTED_REFRESH_PREFIX} (HTTP ${status})`);
      }
    }
    throw error;
  }
}
