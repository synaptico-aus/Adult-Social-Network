import test from "node:test";
import assert from "node:assert/strict";
import { canViewAudience } from "./audience-policy.ts";
test("anonymous viewers cannot access non-public audiences", () => {
  for (const audience of ["only_me", "friends", "this_group", "my_circle", "selected_communities"] as const) assert.equal(canViewAudience(audience, { authenticated: false }), false);
  assert.equal(canViewAudience("public", { authenticated: false }), true);
});
test("public requires explicit public audience", () => assert.equal(canViewAudience("public", { authenticated: false }), true));