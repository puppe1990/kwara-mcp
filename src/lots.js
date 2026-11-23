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
  const nestedDetails = item.lotDetails && typeof item.lotDetails === "object" ? item.lotDetails : {};
  const merged = { ...item, ...nestedItem, ...nestedLot, ...nestedDetails };
  merged.id ??= item.lotId || item.listingId || item.id || nestedDetails.id;
  merged.slug ??= nestedLot.slug || nestedItem.slug || nestedDetails.slug;
  merged.cachedPriceAmountCents ??=
    nestedLot.cachedPriceAmountCents ?? nestedDetails.cachedPriceAmountCents;
  if (!Array.isArray(merged.images) || merged.images.length === 0) {
    const imageUrl = item.image || nestedLot.image || nestedItem.image || nestedDetails.image;
    merged.images = imageUrl ? [{ url: imageUrl }] : [];
  }
  return merged;
}

export function feeCentsForBid(table, bidCents) {
  if (!Array.isArray(table) || bidCents == null) return 0;
  const bid = Number(bidCents);
  if (!Number.isFinite(bid)) return 0;
  const row = table.find((entry) => {
    const from = Number(entry?.fromValueCents);
    const to = Number(entry?.toValueCents);
    return Number.isFinite(from) && Number.isFinite(to) && bid >= from && bid <= to;
  });
  const fee = Number(row?.feeCents);
  return Number.isFinite(fee) ? fee : 0;
}

export function buyerComissaoPct(item) {
  const listing = item?.listing && typeof item.listing === "object" ? item.listing : {};
  const raw = listing.buyerComissionPercent ?? item?.buyerFeePercentage;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function bidCost(bidCents, pct, table) {
  if (bidCents == null || bidCents === "") return null;
  const bid = Number(bidCents);
  if (!Number.isFinite(bid)) return null;
  const despesasCents = feeCentsForBid(table, bid);
  const comissaoCents = Math.round(bid * pct);
  return {
    despesasCents,
    comissaoCents,
    allInCents: bid + despesasCents + comissaoCents,
  };
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
  const incrementCents = setting.minimumIncrementCents ?? null;
  const pct = buyerComissaoPct(item);
  const current = bidCost(item.cachedPriceAmountCents, pct, item.feeStructureValues);
  const nextBidCents =
    current && incrementCents != null && Number.isFinite(Number(incrementCents))
      ? Number(item.cachedPriceAmountCents) + Number(incrementCents)
      : null;
  const next = bidCost(nextBidCents, pct, item.feeStructureValues);
  return {
    ...base,
    description,
    pickupAddress: item.pickUpAddress ?? null,
    incrementCents,
    increment: formatReais(incrementCents),
    images,
    phase: setting.listingPhase?.phaseName ?? null,
    views: item.views ?? null,
    comissaoPct: pct,
    despesasCents: current?.despesasCents ?? null,
    despesas: formatReais(current?.despesasCents),
    comissaoCents: current?.comissaoCents ?? null,
    comissao: formatReais(current?.comissaoCents),
    allInCents: current?.allInCents ?? null,
    allIn: formatReais(current?.allInCents),
    nextBidCents,
    nextBid: formatReais(nextBidCents),
    nextDespesasCents: next?.despesasCents ?? null,
    nextDespesas: formatReais(next?.despesasCents),
    nextComissaoCents: next?.comissaoCents ?? null,
    nextComissao: formatReais(next?.comissaoCents),
    nextAllInCents: next?.allInCents ?? null,
    nextAllIn: formatReais(next?.allInCents),
  };
}
