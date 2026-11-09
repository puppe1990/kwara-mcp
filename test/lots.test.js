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
});
