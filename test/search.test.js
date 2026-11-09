import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyQuery,
  jsonSearchBody,
  parseSearchPayload,
  parseRscSearch,
  RSC_PARSE_ERROR,
} from "../src/search.js";

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/search-rsc.txt"),
  "utf8",
);

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

test("classifyQuery treats mid-path /bens/ as text and keeps bad percent-encoding", () => {
  assert.deepEqual(classifyQuery("look at /bens/foo-99 please"), {
    kind: "text",
    q: "look at /bens/foo-99 please",
  });
  assert.deepEqual(classifyQuery("https://www.kwara.com.br/foo/bens/bar-1"), {
    kind: "text",
    q: "https://www.kwara.com.br/foo/bens/bar-1",
  });
  assert.deepEqual(classifyQuery("/bens/foo-%"), { kind: "lot", id: "foo-%", slug: "foo-%" });
  assert.deepEqual(classifyQuery("/bens/%E0%A4%A"), {
    kind: "lot",
    id: "%E0%A4%A",
    slug: "%E0%A4%A",
  });
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

test("parseSearchPayload reads items and total", () => {
  const parsed = parseSearchPayload({
    items: [{ id: "1", title: "A", slug: "a-1" }],
    totalItems: 4,
  });
  assert.equal(parsed.total, 4);
  assert.equal(parsed.items[0].id, "1");
});

test("parseRscSearch extracts searchResult items", () => {
  const parsed = parseRscSearch(fixture);
  assert.equal(parsed.items[0].title, "Monitor Dell");
  assert.equal(parsed.total, 1);
});

test("parseRscSearch throws the pt-BR error on garbage", () => {
  assert.throws(() => parseRscSearch("not-rsc"), (error) => error.message === RSC_PARSE_ERROR);
});
