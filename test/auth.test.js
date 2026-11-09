import assert from "node:assert/strict";
import test from "node:test";

import { userIdFromAccess } from "../src/auth.js";
import { fakeJwt } from "./factories.js";

test("userIdFromAccess reads id and ignores buyerId", () => {
  const token = fakeJwt({ id: "111", buyerId: "999", type: "access" });
  assert.equal(userIdFromAccess(token), "111");
});
