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
