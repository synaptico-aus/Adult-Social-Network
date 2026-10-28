import assert from "node:assert/strict";
import test from "node:test";
import { canTransitionModeration, MODERATION_SANCTIONS, urgentCategory } from "./moderation-policy";
import { SAFETY_OPERATIONS_POLICY, urgentReviewTargetMinutes } from "./safety-operations-policy";

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

test("approved urgent targets, owners, appeal guidance, and retention periods stay configured", () => {
  assert.equal(SAFETY_OPERATIONS_POLICY.owners.urgentReview, "On-call Moderator");
  assert.equal(urgentReviewTargetMinutes("threats"), 15);
  assert.equal(urgentReviewTargetMinutes("exploitation"), 30);
  assert.equal(urgentReviewTargetMinutes("distress_disclosure"), 15);
  assert.equal(urgentReviewTargetMinutes("harassment"), null);
  assert.equal(urgentCategory("threats"), true);
  assert.equal(SAFETY_OPERATIONS_POLICY.appeals.decisionBusinessDays, 10);
  assert.equal(SAFETY_OPERATIONS_POLICY.retention.resolvedEvidenceDays, 365);
  assert.equal(SAFETY_OPERATIONS_POLICY.retention.staffAccessReviewDays, 90);
});