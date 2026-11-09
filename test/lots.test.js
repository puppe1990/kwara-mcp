import assert from "node:assert/strict";
import test from "node:test";

import { formatReais, lotUrl } from "../src/lots.js";

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
