import { faker } from "@faker-js/faker";

export function fakeJwt({ type = "access", id, buyerId, exp } = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = {
    type,
    id: id ?? faker.string.numeric(16),
    buyerId: buyerId ?? faker.string.numeric(17),
    exp: exp ?? Math.floor(Date.now() / 1000) + 900,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${payloadB64}.sig`;
}

export function fakeLot(overrides = {}) {
  const id = String(overrides.id ?? faker.string.numeric(19));
  const slugBase = faker.helpers.slugify(faker.commerce.productName()).toLowerCase() || "lote";
  const listingId = String(overrides.listingId ?? faker.string.numeric(19));
  return {
    id,
    number: 7,
    title: "Monitor Dell E1911c",
    slug: `${slugBase}-${id}`,
    listingId,
    listing: {
      title: "Leilao Ecobraz",
      kwaraId: "K-3161",
    },
    cachedPriceAmountCents: 123,
    cachedBidsCount: 2,
    scheduledEndAt: "2026-11-10T18:00:00.000Z",
    currentEndAt: "2026-11-10T18:00:00.000Z",
    pickUpState: "SP",
    pickUpAddress: "Rua A, 1",
    isEnded: false,
    views: 9,
    description: "Um monitor.",
    images: [{ url: "https://cdn.example/a.jpg" }, { url: "https://cdn.example/b.jpg" }, { url: "https://cdn.example/c.jpg" }, { url: "https://cdn.example/d.jpg" }],
    lotAuctionSettings: [
      {
        isCurrent: true,
        startingBidCents: 100,
        minimumIncrementCents: 10,
        listingPhase: { phaseName: "Aberto" },
      },
    ],
    feeTable: [{ amount: 999 }],
    bids: [{ amount: 123 }],
    ...overrides,
  };
}
