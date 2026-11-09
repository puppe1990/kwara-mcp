import assert from "node:assert/strict";
import test from "node:test";

import { KwaraHttpError, kwaraFetch } from "../src/client.js";

test("kwaraFetch sends Origin and returns JSON", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => (name === "content-type" ? "application/json" : null) },
      json: async () => ({ ok: true }),
    };
  };
  const body = await kwaraFetch("https://api.kwara.com.br/web/lots/1/details", { fetchImpl });
  assert.deepEqual(body, { ok: true });
  assert.equal(calls[0].init.headers.Origin, "https://www.kwara.com.br");
  assert.equal(calls[0].init.headers.Accept, "application/json");
});

test("kwaraFetch throws status and path without response body", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 404,
    headers: { get: () => "application/json" },
    json: async () => ({ accessToken: "secret" }),
    text: async () => "secret",
  });
  await assert.rejects(
    () => kwaraFetch("https://api.kwara.com.br/web/lots/9/details", { fetchImpl }),
    (error) => {
      assert.equal(error instanceof KwaraHttpError, true);
      assert.equal(error.status, 404);
      assert.equal(error.path, "/web/lots/9/details");
      assert.equal(error.message, "HTTP 404 /web/lots/9/details");
      assert.doesNotMatch(error.message, /secret/);
      return true;
    },
  );
});
