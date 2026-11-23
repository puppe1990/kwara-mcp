import assert from "node:assert/strict";
import test from "node:test";

import { compactLot, compactLotDetails, formatReais, lotUrl } from "../src/lots.js";
import { fakeLot } from "./factories.js";

test("formatReais turns cents into R$ with comma", () => {
  assert.equal(formatReais(123), "R$ 1,23");
  assert.equal(formatReais(100), "R$ 1,00");
  assert.equal(formatReais(0), "R$ 0,00");
  assert.equal(formatReais(null), null);
});

test("lotUrl uses slug when it already ends with the id", () => {
  assert.equal(
    lotUrl("monitor-dell-e1911c-1745009854700848771", "1745009854700848771"),
    "https://www.kwara.com.br/bens/monitor-dell-e1911c-1745009854700848771",
  );
});

test("lotUrl appends id when the slug does not include it", () => {
  assert.equal(
    lotUrl("monitor-dell-e1911c", "1745009854700848771"),
    "https://www.kwara.com.br/bens/monitor-dell-e1911c-1745009854700848771",
  );
});

test("compactLot maps list fields and drops fee tables", () => {
  const raw = fakeLot({
    id: "1745009854700848771",
    slug: "monitor-dell-e1911c-1745009854700848771",
    cachedPriceAmountCents: 123,
  });
  const lot = compactLot(raw);
  assert.equal(lot.id, "1745009854700848771");
  assert.equal(lot.title, "Monitor Dell E1911c");
  assert.equal(lot.currentBidCents, 123);
  assert.equal(lot.currentBid, "R$ 1,23");
  assert.equal(lot.startingBidCents, 100);
  assert.equal(lot.kwaraId, "K-3161");
  assert.equal(lot.ended, false);
  assert.equal(
    lot.url,
    "https://www.kwara.com.br/bens/monitor-dell-e1911c-1745009854700848771",
  );
  assert.equal(lot.feeTable, undefined);
  assert.equal(lot.bids, undefined);
  assert.equal(lot.images, undefined);
});

test("compactLot unwraps nested item and lot", () => {
  const lot = compactLot({
    item: { title: "Inner" },
    lot: { id: "9", slug: "inner-9", cachedPriceAmountCents: 50 },
    listing: { title: "Evento", kwaraId: "K-1" },
  });
  assert.equal(lot.id, "9");
  assert.equal(lot.title, "Inner");
  assert.equal(lot.currentBidCents, 50);
});

test("compactLotDetails adds description, images cap, increment, no bids", () => {
  const details = compactLotDetails(
    fakeLot({
      id: "1",
      slug: "a-1",
      description: "<p>Oi</p> " + "x".repeat(2500),
    }),
  );
  assert.equal(details.incrementCents, 10);
  assert.equal(details.increment, "R$ 0,10");
  assert.equal(details.phase, "Aberto");
  assert.equal(details.views, 9);
  assert.equal(details.pickupAddress, "Rua A, 1");
  assert.equal(details.images.length, 3);
  assert.equal(details.description.includes("<p>"), false);
  assert.ok(details.description.length <= 2000);
  assert.equal(details.bids, undefined);
  assert.equal(details.feeTable, undefined);
  assert.equal(details.feeStructureValues, undefined);
});

const KWARA_FEE_BRACKETS = [
  { fromValueCents: 30000, toValueCents: 39999, feeCents: 11000 },
  { fromValueCents: 40000, toValueCents: 49999, feeCents: 14100 },
];

test("compactLotDetails all-in is bid plus 5% commission plus bracket despesas", () => {
  const details = compactLotDetails(
    fakeLot({
      cachedPriceAmountCents: 39700,
      listing: {
        title: "Leilao Ecobraz",
        kwaraId: "K-3089",
        buyerComissionPercent: 0.05,
      },
      feeStructureValues: KWARA_FEE_BRACKETS,
      lotAuctionSettings: [
        {
          isCurrent: true,
          startingBidCents: 39700,
          minimumIncrementCents: 2000,
          listingPhase: { phaseName: "1º Leilão" },
        },
      ],
    }),
  );
  assert.equal(details.comissaoPct, 0.05);
  assert.equal(details.despesasCents, 11000);
  assert.equal(details.despesas, "R$ 110,00");
  assert.equal(details.comissaoCents, 1985);
  assert.equal(details.comissao, "R$ 19,85");
  assert.equal(details.allInCents, 52685);
  assert.equal(details.allIn, "R$ 526,85");
  assert.equal(details.nextBidCents, 41700);
  assert.equal(details.nextBid, "R$ 417,00");
  assert.equal(details.nextDespesasCents, 14100);
  assert.equal(details.nextDespesas, "R$ 141,00");
  assert.equal(details.nextComissaoCents, 2085);
  assert.equal(details.nextComissao, "R$ 20,85");
  assert.equal(details.nextAllInCents, 57885);
  assert.equal(details.nextAllIn, "R$ 578,85");
  assert.equal(details.feeTable, undefined);
  assert.equal(details.feeStructureValues, undefined);
});

test("compactLotDetails unwraps lotDetails envelope for title and all-in", () => {
  const details = compactLotDetails({
    lotDetails: fakeLot({
      id: "1754396646688425320",
      title: "iPhone 11 128GB",
      cachedPriceAmountCents: 39700,
      listing: { title: "Galpão", kwaraId: "K-3089", buyerComissionPercent: 0.05 },
      feeStructureValues: KWARA_FEE_BRACKETS,
      lotAuctionSettings: [
        { isCurrent: true, startingBidCents: 39700, minimumIncrementCents: 2000 },
      ],
    }),
  });
  assert.equal(details.id, "1754396646688425320");
  assert.equal(details.title, "iPhone 11 128GB");
  assert.equal(details.allInCents, 52685);
  assert.equal(details.nextAllInCents, 57885);
});

test("compactLotDetails falls back to buyerFeePercentage and zero despesas without brackets", () => {
  const details = compactLotDetails(
    fakeLot({
      cachedPriceAmountCents: 20000,
      buyerFeePercentage: 0.05,
      listing: { title: "X", kwaraId: "K-1" },
      lotAuctionSettings: [
        { isCurrent: true, startingBidCents: 20000, minimumIncrementCents: 1000 },
      ],
    }),
  );
  assert.equal(details.comissaoPct, 0.05);
  assert.equal(details.despesasCents, 0);
  assert.equal(details.allInCents, 21000);
  assert.equal(details.nextBidCents, 21000);
  assert.equal(details.nextAllInCents, 22050);
});

test("compactLotDetails leaves next all-in null without an increment", () => {
  const details = compactLotDetails(
    fakeLot({
      cachedPriceAmountCents: 39700,
      listing: { buyerComissionPercent: 0.05 },
      feeStructureValues: KWARA_FEE_BRACKETS,
      lotAuctionSettings: [{ isCurrent: true, startingBidCents: 39700 }],
    }),
  );
  assert.equal(details.allInCents, 52685);
  assert.equal(details.nextBidCents, null);
  assert.equal(details.nextAllInCents, null);
  assert.equal(details.nextAllIn, null);
});

test("compactLot still omits all-in and fee tables", () => {
  const lot = compactLot(
    fakeLot({
      cachedPriceAmountCents: 39700,
      listing: { title: "X", kwaraId: "K-1", buyerComissionPercent: 0.05 },
      feeStructureValues: KWARA_FEE_BRACKETS,
    }),
  );
  assert.equal(lot.allInCents, undefined);
  assert.equal(lot.comissaoPct, undefined);
  assert.equal(lot.feeTable, undefined);
  assert.equal(lot.feeStructureValues, undefined);
});
