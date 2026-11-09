import { compactLot } from "./lots.js";

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
