import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "@workspace/api-client-react";
import { recoverReverificationHint } from "./reverification";

function apiError(status: number, data: unknown) {
  return new ApiError(new Response("", { status }), data, { method: "POST", url: "/api/account/deletion" });
}
test("Clerk receives its structured hint even when the generated client throws", () => {
  const hint = { clerk_error: { type: "forbidden", reason: "reverification-error", metadata: { reverification: { level: "first_factor", afterMinutes: 5 } } } };
  assert.equal(recoverReverificationHint(apiError(403, hint)), hint);
});
test("ordinary permission/network errors cannot become successful deletion or a reverification hint", () => {
  for (const error of [apiError(403, { error: "Not authorised" }), apiError(500, { clerk_error: { type: "forbidden", reason: "reverification-error" } }), new Error("Network unavailable")]) {
    assert.throws(() => recoverReverificationHint(error), e => e === error);
  }
});
