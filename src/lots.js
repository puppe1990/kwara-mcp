export const SITE_ORIGIN = "https://www.kwara.com.br";
export const API_ORIGIN = "https://api.kwara.com.br";

export function formatReais(cents) {
  if (cents == null || cents === "") return null;
  const value = Number(cents);
  if (!Number.isFinite(value)) return null;
  return `R$ ${(value / 100).toFixed(2).replace(".", ",")}`;
}

export function lotUrl(slug, id) {
  const s = slug == null ? "" : String(slug);
  const i = id == null ? "" : String(id);
  if (!s && !i) return null;
  if (s && i && (s.endsWith(`-${i}`) || s === i)) {
    return `${SITE_ORIGIN}/bens/${s}`;
  }
  if (s && i) return `${SITE_ORIGIN}/bens/${s}-${i}`;
  if (s) return `${SITE_ORIGIN}/bens/${s}`;
  return `${SITE_ORIGIN}/bens/${i}`;
}

export function currentAuctionSetting(lot) {
  const current = lot?.currentLotAuctionSetting;
  if (current && typeof current === "object") return current;
  const settings = Array.isArray(lot?.lotAuctionSettings) ? lot.lotAuctionSettings : [];
  return settings.find((row) => row?.isCurrent) || settings[0] || {};
}

export function normalizeLotPayload(item) {
  if (!item || typeof item !== "object") return {};
  const nestedItem = item.item && typeof item.item === "object" ? item.item : {};
  const nestedLot = item.lot && typeof item.lot === "object" ? item.lot : {};
  const merged = { ...item, ...nestedItem, ...nestedLot };
  merged.id ??= item.lotId || item.listingId || item.id;
  merged.slug ??= nestedLot.slug || nestedItem.slug;
  merged.cachedPriceAmountCents ??= nestedLot.cachedPriceAmountCents;
  if (!Array.isArray(merged.images) || merged.images.length === 0) {
    const imageUrl = item.image || nestedLot.image || nestedItem.image;
    merged.images = imageUrl ? [{ url: imageUrl }] : [];
  }
  return merged;
}

export function compactLot(raw) {
  const item = normalizeLotPayload(raw);
  const setting = currentAuctionSetting(item);
  const listing = item.listing && typeof item.listing === "object" ? item.listing : {};
  const id = item.id == null ? null : String(item.id);
  const slug = item.slug ?? null;
  const listingId =
    item.listingId != null
      ? String(item.listingId)
      : listing.id != null
        ? String(listing.id)
        : null;
  return {
    id,
    number: item.number ?? null,
    title: item.title ?? null,
    slug,
    listingId,
    listingTitle: listing.title ?? null,
    kwaraId: listing.kwaraId ?? null,
    currentBidCents: item.cachedPriceAmountCents ?? null,
    currentBid: formatReais(item.cachedPriceAmountCents),
    startingBidCents: setting.startingBidCents ?? null,
    startingBid: formatReais(setting.startingBidCents),
    bidsCount: item.cachedBidsCount ?? null,
    endsAt: item.currentEndAt || item.scheduledEndAt || null,
    pickupState: item.pickUpState ?? null,
    ended: item.isEnded === true,
    url: lotUrl(slug, id),
  };
}

function stripHtml(text) {
  return String(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactLotDetails(raw) {
  const item = normalizeLotPayload(raw);
  const setting = currentAuctionSetting(item);
  const base = compactLot(item);
  let description = item.description == null ? null : stripHtml(item.description);
  if (description && description.length > 2000) description = description.slice(0, 2000);
  const images = Array.isArray(item.images)
    ? item.images
        .map((image) => (typeof image === "string" ? image : image?.url))
        .filter(Boolean)
        .slice(0, 3)
    : [];
  return {
    ...base,
    description,
    pickupAddress: item.pickUpAddress ?? null,
    incrementCents: setting.minimumIncrementCents ?? null,
    increment: formatReais(setting.minimumIncrementCents),
    images,
    phase: setting.listingPhase?.phaseName ?? null,
    views: item.views ?? null,
  };
}
