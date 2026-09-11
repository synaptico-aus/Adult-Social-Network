import test from "node:test";
import assert from "node:assert/strict";
import {
  authenticatedUser, isAdultEligible, validOnboardingDocuments, freshFirstFactor,
  isStaff, ownsSession, acceptOneTimeRecovery,
  withinRateLimit,
} from "./account-policy.ts";

test("unauthenticated auth decision rejects missing user", () => {
  assert.equal(authenticatedUser(undefined), false);
  assert.equal(authenticatedUser("member-a"), true);
});
test("underage declaration is rejected", () => assert.equal(isAdultEligible(false), false));
test("missing, stale, and duplicate consent are rejected", () => {
  const complete = [
    { document: "terms", version: "2026-01" },
    { document: "privacy", version: "2026-01" },
    { document: "community_guidelines", version: "2026-01" },
  ];
  assert.equal(validOnboardingDocuments(complete.slice(0, 2)), false);
  assert.equal(validOnboardingDocuments(complete.map((item) => ({ ...item, version: "2025-01" }))), false);
  assert.equal(validOnboardingDocuments([...complete, complete[0]]), false);
});
test("deletion requires first-factor fva age from zero through five minutes", () => {
  assert.equal(freshFirstFactor(undefined), false);
  assert.equal(freshFirstFactor([6, 0]), false);
  assert.equal(freshFirstFactor([-1, 0]), false);
  assert.equal(freshFirstFactor([0, 0]), true);
});
test("staff requires private role and fresh second factor", () => {
  assert.equal(isStaff({}, [0, 1]), false);
  assert.equal(isStaff({ role: "staff" }, [0, 6]), false);
  assert.equal(isStaff({ role: "staff" }, [0, 5]), true);
});
test("session ownership is account-scoped", () => {
  assert.equal(ownsSession(["session-a"], "session-b"), false);
  assert.equal(ownsSession(["session-a"], "session-a"), true);
});
test("sensitive limiter permits threshold and rejects over threshold", () => {
  assert.equal(withinRateLimit(20, 20), true);
  assert.equal(withinRateLimit(21, 20), false);
});
test("recovery assertions expire, cannot be reused, and stay account-bound", () => {
  assert.deepEqual(acceptOneTimeRecovery({ accountId: "a", expiresAt: 1, used: false }, 2), { accepted: false });
  assert.deepEqual(acceptOneTimeRecovery({ accountId: "a", expiresAt: 100, used: true }, 2), { accepted: false });
  assert.deepEqual(acceptOneTimeRecovery({ accountId: "a", expiresAt: 100, used: false }, 2), { accepted: true, accountId: "a" });
});