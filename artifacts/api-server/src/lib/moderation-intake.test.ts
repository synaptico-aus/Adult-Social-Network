import test from "node:test";
import assert from "node:assert/strict";
import { deterministicTextScreening, requireMediaScreening } from "./screening.ts";
test("deterministic screening does not auto-remove and distinguishes ordinary distress text", () => {
  assert.equal(deterministicTextScreening("I feel distressed and need support").decision, "allowed");
  assert.equal(deterministicTextScreening("how to poison someone").decision, "held");
});
test("required media screening unavailable is held", () => assert.equal(requireMediaScreening(undefined), "held"));