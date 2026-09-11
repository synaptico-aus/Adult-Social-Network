import assert from "node:assert/strict";
import test from "node:test";
import { canTransitionModeration, MODERATION_SANCTIONS } from "./moderation-policy";

test("staff decisions use defined sanctions and guarded states", () => {
  assert.deepEqual(MODERATION_SANCTIONS, [
    "warning",
    "content_removal",
    "temporary_restriction",
    "suspension",
    "permanent_removal",
  ]);
  assert.equal(canTransitionModeration("pending", "held"), true);
  assert.equal(canTransitionModeration("pending", "appealed"), false);
  assert.equal(canTransitionModeration("removed", "pending"), false);
});