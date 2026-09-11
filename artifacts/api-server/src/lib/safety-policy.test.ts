import test from "node:test";
import assert from "node:assert/strict";
import { isOwnSafetyRecord } from "./safety-policy.ts";
test("safety records stay scoped to the signed-in member", () => {
  assert.equal(isOwnSafetyRecord("member-a", "member-a"), true);
  assert.equal(isOwnSafetyRecord("member-a", "member-b"), false);
});