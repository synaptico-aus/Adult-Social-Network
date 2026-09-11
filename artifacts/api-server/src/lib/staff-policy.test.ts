import test from "node:test";
import assert from "node:assert/strict";
import { roleHasCapability, STAFF_ROLE_CAPABILITIES } from "./staff-policy.ts";
test("staff roles are distinct and never use legacy metadata wildcard", () => {
  assert.equal(roleHasCapability("moderator", "moderation.decide"), true);
  assert.equal(roleHasCapability("education_editor", "moderation.decide"), false);
  assert.equal(roleHasCapability("staff", "moderation.decide"), false);
  assert.equal(roleHasCapability("administrator", "staff.roles"), true);
  assert.deepEqual(STAFF_ROLE_CAPABILITIES.education_editor, ["verification.review"]);
});
test("assignment capabilities deliberately narrow defaults", () => {
  assert.equal(roleHasCapability("administrator", "moderation.decide", ["verification.review"]), false);
  assert.equal(roleHasCapability("moderator", "verification.review", ["verification.review"]), true);
});