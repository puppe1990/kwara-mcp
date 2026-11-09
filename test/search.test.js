import assert from "node:assert/strict";
import test from "node:test";

import { classifyQuery, jsonSearchBody } from "../src/search.js";

test("classifyQuery maps lot URL, event URL, K-code, digits, and text", () => {
  assert.deepEqual(
    classifyQuery("https://www.kwara.com.br/bens/monitor-dell-e1911c-1745009854700848771"),
    { kind: "lot", id: "1745009854700848771", slug: "monitor-dell-e1911c-1745009854700848771" },
  );
  assert.deepEqual(classifyQuery("/bens/foo-99"), { kind: "lot", id: "99", slug: "foo-99" });
  assert.deepEqual(
    classifyQuery("https://www.kwara.com.br/evento/leilao-ecobraz-K-2551"),
    { kind: "listingSlug", listingSlug: "K-2551" },
  );
  assert.deepEqual(classifyQuery("K-3161"), { kind: "listingSlug", listingSlug: "K-3161" });
  assert.deepEqual(
    classifyQuery("leilao-de-itens-ecobraz-K-2551"),
    { kind: "listingSlug", listingSlug: "K-2551" },
  );
  assert.deepEqual(classifyQuery("1734052348763833993"), {
    kind: "listingId",
    listingId: "1734052348763833993",
  });
  assert.deepEqual(classifyQuery("monitor dell"), { kind: "text", q: "monitor dell" });
});

test("jsonSearchBody fills listingSlugs or listingIds and keeps empty arrays", () => {
  const bySlug = jsonSearchBody({ kind: "listingSlug", listingSlug: "K-3161" });
  assert.deepEqual(bySlug.listingSlugs, ["K-3161"]);
  assert.deepEqual(bySlug.listingIds, []);
  assert.equal(bySlug.showFinalizedLast, true);
  assert.equal(Object.hasOwn(bySlug, "q"), false);
  const byId = jsonSearchBody({ kind: "listingId", listingId: "12" });
  assert.deepEqual(byId.listingIds, ["12"]);
  assert.deepEqual(byId.listingSlugs, []);
});
