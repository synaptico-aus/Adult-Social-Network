import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool, membersTable, reportsTable, moderationRecordsTable, operationalCountersTable } from "@workspace/db";
import { createApp } from "../app";
import { takeRateSlot, rateSubject } from "../lib/shared-rate-limit";
import { featureEnabled } from "../lib/operations-policy";
import { releaseHold } from "../lib/release-holds";

const alice = `p17-test-alice-${randomUUID()}`, bob = `p17-test-bob-${randomUUID()}`;
const subjects = [alice, bob];
const app = createApp({ authMiddleware: (req: any, _res, next) => {
  const userId = req.header("x-test-user") ?? null;
  req.auth = Object.assign(() => ({ userId, tokenType: "session_token", sessionClaims: { fva: [0, 0] } }), { [Symbol.for("@clerk/express.auth")]: true });
  next();
} });
let server: ReturnType<typeof app.listen>, base: string;
before(async () => {
  await db.insert(membersTable).values(subjects.map(id => ({ id, clerkUserId: id, active: true, emailVerified: true, ageEligible: true })));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
});
after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  const reports = await db.select({ id: reportsTable.id }).from(reportsTable).where(eq(reportsTable.reporterMemberId, alice));
  if (reports.length) await db.delete(moderationRecordsTable).where(inArray(moderationRecordsTable.reportId, reports.map(x => x.id)));
  await db.delete(reportsTable).where(eq(reportsTable.reporterMemberId, alice));
  for (const user of subjects) await db.delete(operationalCountersTable).where(sql`${operationalCountersTable.key} like ${`rate:${rateSubject(user)}:%`}`);
  await db.delete(membersTable).where(inArray(membersTable.id, subjects));
  await pool.end();
});
async function report(category = "harassment") {
  return fetch(`${base}/reports`, { method: "POST", headers: { "x-test-user": alice, "content-type": "application/json" },
    body: JSON.stringify({ targetMemberId: bob, category, details: "Clearly labelled synthetic Phase 17 report; no real person." }) });
}
test("shared atomic admission never allows more than its limit under concurrent calls", async () => {
  const results = await Promise.all(Array.from({ length: 30 }, () => takeRateSlot(bob, "p17-concurrency", 5, 60_000)));
  assert.equal(results.filter(x => x.allowed).length, 5);
  assert.ok(results.every(x => x.retryAfter >= 1));
  const otherBucket = await takeRateSlot(bob, "p17-other", 5, 60_000);
  assert.equal(otherBucket.allowed, true);
});
test("concurrent duplicate reports reuse one case; distinct urgent category remains reportable", async () => {
  const responses = await Promise.all(Array.from({ length: 8 }, () => report()));
  assert.ok(responses.every(x => x.status === 201));
  const payloads = await Promise.all(responses.map(x => x.json())) as any[];
  assert.equal(new Set(payloads.map(x => x.report.id)).size, 1);
  const urgent = await report("threats");
  assert.equal(urgent.status, 201);
  const other = await urgent.json() as any;
  assert.notEqual(other.report.id, payloads[0].report.id);
});
test("report intake has a bounded shared allowance and an explicit retry response", async () => {
  const responses = await Promise.all(Array.from({ length: 22 }, () => report()));
  const denied = responses.filter(x => x.status === 429);
  assert.ok(denied.length > 0);
  assert.ok(denied.every(x => Number(x.headers.get("retry-after")) > 0));
  const rows = await db.select().from(reportsTable).where(eq(reportsTable.reporterMemberId, alice));
  assert.equal(rows.length, 2);
});
test("unresolved upload and video holds cannot be overridden by operational defaults", async () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.match(releaseHold("uploads")!, /byte limits/);
    assert.equal(await featureEnabled("uploads"), false);
    assert.equal(await featureEnabled("video_processing"), false);
    const response = await fetch(`${base}/media/uploads/request`, { method: "POST", headers: { "x-test-user": bob, "content-type": "application/json" }, body: "{}" });
    assert.equal(response.status, 503);
    const onboarding = await fetch(`${base}/account/onboarding`, { method: "POST", headers: { "x-test-user": bob, "content-type": "application/json" }, body: "{}" });
    assert.equal(onboarding.status, 503);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
});
