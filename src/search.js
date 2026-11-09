import { KwaraHttpError, kwaraFetch } from "./client.js";
import { API_ORIGIN, SITE_ORIGIN, compactLot, compactLotDetails } from "./lots.js";

const K_CODE = /K-\d+/i;

function pathFromQuery(q) {
  const trimmed = String(q ?? "").trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return { trimmed, path: new URL(trimmed).pathname };
    } catch {
      return { trimmed, path: trimmed };
    }
  }
  return { trimmed, path: trimmed };
}

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch (err) {
    if (err instanceof URIError) return segment;
    throw err;
  }
}

export function classifyQuery(q) {
  const { trimmed, path } = pathFromQuery(q);
  if (!trimmed) return { kind: "text", q: trimmed };

  const bens = path.match(/^\/bens\/([^/?#\s]+)/);
  if (bens) {
    const slug = decodeSegment(bens[1]);
    const idMatch = slug.match(/(\d+)$/);
    return { kind: "lot", id: idMatch ? idMatch[1] : slug, slug };
  }

  const evento = path.match(/^\/evento\/([^/?#\s]+)/);
  if (evento) {
    const slug = decodeSegment(evento[1]);
    const code = slug.match(K_CODE);
    return { kind: "listingSlug", listingSlug: code ? code[0] : slug };
  }

  if (/^K-\d+$/i.test(trimmed)) {
    return { kind: "listingSlug", listingSlug: trimmed };
  }

  const embedded = trimmed.match(K_CODE);
  if (embedded) {
    return { kind: "listingSlug", listingSlug: embedded[0] };
  }

  if (/^\d+$/.test(trimmed)) {
    return { kind: "listingId", listingId: trimmed };
  }

  return { kind: "text", q: trimmed };
}

export function jsonSearchBody(classification) {
  const body = {
    listingIds: [],
    assetCategoryIds: [],
    sellerIds: [],
    tags: [],
    refs: [],
    segments: [],
    listingSlugs: [],
    showFinalizedLast: true,
  };
  if (classification.kind === "listingSlug") {
    body.listingSlugs = [classification.listingSlug];
  }
  if (classification.kind === "listingId") {
    body.listingIds = [classification.listingId];
  }
  return body;
}

export const RSC_PARSE_ERROR = "não deu para ler a busca do site";

function itemsFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data?.items)) return payload.data.items;
  return [];
}

function totalFrom(payload) {
  if (!payload || typeof payload !== "object") return null;
  const total = payload.totalItems ?? payload.total ?? payload.data?.totalItems ?? payload.data?.total;
  return total == null ? null : Number(total);
}

export function parseSearchPayload(payload) {
  return {
    items: itemsFrom(payload).map(compactLot).filter((lot) => lot.id),
    total: totalFrom(payload),
  };
}

function balancedObject(source, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return null;
}

export function parseRscSearch(body) {
  if (typeof body !== "string") throw new Error(RSC_PARSE_ERROR);
  const key = '"searchResult":';
  const keyIdx = body.indexOf(key);
  if (keyIdx === -1) throw new Error(RSC_PARSE_ERROR);
  const objectStart = body.indexOf("{", keyIdx + key.length);
  if (objectStart === -1) throw new Error(RSC_PARSE_ERROR);
  const json = balancedObject(body, objectStart);
  if (!json) throw new Error(RSC_PARSE_ERROR);
  try {
    return parseSearchPayload(JSON.parse(json));
  } catch {
    throw new Error(RSC_PARSE_ERROR);
  }
}

export const BUSCA_ROUTER_STATE_TREE =
  '%5B%22%22%2C%7B%22children%22%3A%5B%22busca%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2C%22refetch%22%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C16%5D';

function clampTake(take) {
  const value = Number(take ?? 20);
  if (!Number.isFinite(value) || value <= 0) return 20;
  return Math.min(50, Math.trunc(value));
}

export function lotNotFoundMessage(id) {
  return `lote ${id} não encontrado`;
}

export async function fetchLotDetails(id, { fetchImpl } = {}) {
  const pathId = encodeURIComponent(String(id));
  const url = `${API_ORIGIN}/web/lots/${pathId}/details?includeBids=true&isBot=false`;
  try {
    const payload = await kwaraFetch(url, { fetchImpl });
    return compactLotDetails(payload);
  } catch (error) {
    if (error instanceof KwaraHttpError && error.status === 404) {
      throw new Error(lotNotFoundMessage(id));
    }
    throw error;
  }
}

export async function searchLots({ q, take = 20, skip = 0, fetchImpl } = {}) {
  const classification = classifyQuery(q);
  const limit = clampTake(take);
  const offset = Math.max(0, Number(skip) || 0);

  if (classification.kind === "lot") {
    const lot = await fetchLotDetails(classification.id, { fetchImpl });
    return { items: [lot], total: 1, source: "details" };
  }

  if (classification.kind === "text") {
    const page = Math.floor(offset / limit) + 1;
    let url = `${SITE_ORIGIN}/busca?q=${encodeURIComponent(classification.q)}`;
    if (offset > 0) url += `&currentPage=${page}`;
    const body = await kwaraFetch(url, {
      fetchImpl,
      headers: {
        Accept: "*/*",
        rsc: "1",
        "next-url": "/busca",
        "next-router-state-tree": BUSCA_ROUTER_STATE_TREE,
      },
    });
    const parsed = parseRscSearch(typeof body === "string" ? body : JSON.stringify(body));
    return { ...parsed, source: "rsc" };
  }

  const url = `${API_ORIGIN}/web/lots/search?take=${limit}&skip=${offset}`;
  const payload = await kwaraFetch(url, {
    method: "POST",
    fetchImpl,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jsonSearchBody(classification)),
  });
  return { ...parseSearchPayload(payload), source: "json" };
}
