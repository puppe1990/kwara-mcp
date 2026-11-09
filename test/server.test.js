import assert from "node:assert/strict";
import test from "node:test";

import { TOOLS, createServer } from "../src/index.js";

test("createServer registers the three Kwara tools", () => {
  assert.equal(typeof createServer, "function");
  assert.deepEqual(
    TOOLS.map((tool) => tool.name),
    ["kwara_search", "kwara_lot", "kwara_favorites"],
  );
});
