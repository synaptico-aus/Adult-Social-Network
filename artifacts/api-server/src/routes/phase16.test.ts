import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { createApp } from "../app";
import { db, pool, membersTable, staffRoleAssignmentsTable, operationsRecordsTable, announcementsTable, featureControlsTable, reportsTable, moderationRecordsTable, serviceMeasurementsTable, sensitiveActionAuditTable, dutySessionsTable, humanResponsesTable, deletionRequestsTable, deletionStepsTable, experienceDraftsTable } from "@workspace/db";
import { roleHasCapability } from "../lib/staff-policy";
import { executeDeletion } from "../lib/deletion-workflow";
import { listDeletionHooks } from "../lib/deletion-hooks";
import { groupsTable } from "@workspace/db";
const ids = Object.fromEntries(["admin", "admin2", "moderator", "scoped", "editor", "member"].map(k => [k, `p16-${k}-${randomUUID()}`])) as Record<string, string>;
const all = Object.values(ids), assignments: Record<string, string> = {};
const app = createApp({ authMiddleware: (req: any, _res: any, next: any) => {
  const userId = req.header("x-test-user") || null;
  req.auth = Object.assign(() => ({ userId, tokenType: "session_token", sessionClaims: { fva: req.header("x-no-mfa") ? [0, -1] : [0, 0] } }), { [Symbol.for("@clerk/express.auth")]: true }); next();
} });
let server: ReturnType<typeof app.listen>, base = "", previousAnalytics: typeof featureControlsTable.$inferSelect | undefined;
async function call(path: string, who = ids.admin, method = "GET", body?: unknown, noMfa = false) {
  const r = await fetch(`${base}/api${path}`, { method, headers: { "x-test-user": who, ...(noMfa ? { "x-no-mfa": "1" } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) as any };
}
const command = (action: string, data: Record<string, unknown> = {}, who = ids.admin) => call("/staff/ops/commands", who, "POST", { action, reason: "Fictional integration-test operator reason", ...data });
before(async () => {
  for (const [name, id] of Object.entries(ids)) {
    await db.insert(membersTable).values({ id, clerkUserId: id, active: true, emailVerified: true, ageEligible: true });
    if (name !== "member") {
      const role = name.startsWith("admin") ? "administrator" : name === "editor" ? "education_editor" : "moderator";
      assignments[name] = randomUUID();
      await db.insert(staffRoleAssignmentsTable).values({ id: assignments[name], clerkUserId: id, role, groupIds: name === "scoped" ? ["p16-group-a"] : [] });
    }
  }
  previousAnalytics = (await db.select().from(featureControlsTable).where(eq(featureControlsTable.key, "analytics")))[0];
  server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  await new Promise<void>(r => server.close(() => r()));
  const requests = await db.select().from(deletionRequestsTable).where(inArray(deletionRequestsTable.memberId, all));
  if (requests.length) await db.delete(deletionStepsTable).where(inArray(deletionStepsTable.requestId, requests.map(x => x.id)));
  await db.delete(deletionRequestsTable).where(inArray(deletionRequestsTable.memberId, all));
  await db.delete(operationsRecordsTable).where(inArray(operationsRecordsTable.actorClerkUserId, all));
  await db.delete(sensitiveActionAuditTable).where(inArray(sensitiveActionAuditTable.actorClerkUserId, all));
  await db.delete(dutySessionsTable).where(inArray(dutySessionsTable.actorClerkUserId, all));
  await db.delete(humanResponsesTable).where(inArray(humanResponsesTable.actorClerkUserId, all));
  await db.delete(announcementsTable).where(inArray(announcementsTable.authorClerkUserId, all));
  await db.delete(staffRoleAssignmentsTable).where(inArray(staffRoleAssignmentsTable.clerkUserId, all));
  await db.delete(reportsTable).where(inArray(reportsTable.reporterMemberId, all));
  await db.delete(membersTable).where(inArray(membersTable.id, all));
  if (previousAnalytics) await db.insert(featureControlsTable).values(previousAnalytics).onConflictDoUpdate({ target: featureControlsTable.key, set: previousAnalytics });
  else await db.delete(featureControlsTable).where(eq(featureControlsTable.key, "analytics"));
  await pool.end();
});
test("staff dashboard uses actual metrics, fresh MFA and scoped capability ceilings", async () => {
  assert.equal((await call("/staff/ops", ids.member)).status, 403);
  assert.equal((await call("/staff/ops", ids.admin, "GET", undefined, true)).status, 403);
  const result = await call("/staff/ops");
  assert.equal(result.status, 200);
  assert.equal(result.body.metrics.find((m: any) => m.key === "actual_cost_usd").value, null);
  assert.match(result.body.staffingNotice, /No confirmed 24\/7/);
  assert.ok(result.body.checks.some((x: any) => x.status === "blocked"));
  assert.equal(roleHasCapability("moderator", "staff.roles", ["staff.roles"]), false);
  assert.equal((await call("/staff/ops/records/users", ids.editor)).status, 403);
  assert.equal((await command("assign_role", { targetId: ids.member, role: "moderator", capabilities: ["staff.roles"] })).status, 400);
});
test("expired grants require independent dated access review; self review cannot unlock access", async () => {
  await db.update(staffRoleAssignmentsTable).set({ createdAt: new Date(Date.now() - 31 * 86400000) }).where(eq(staffRoleAssignmentsTable.id, assignments.moderator));
  assert.equal((await call("/staff/capabilities", ids.moderator)).status, 403);
  assert.equal((await command("review_access", { targetId: assignments.admin, validUntil: new Date(Date.now()+86400000).toISOString() })).status, 403);
  assert.equal((await command("review_access", { targetId: assignments.moderator })).status, 400);
  assert.equal((await command("review_access", { targetId: assignments.moderator, validUntil: new Date(Date.now()+86400000).toISOString(), reference: "fictional reviewed access roster" })).status, 200);
  assert.equal((await call("/staff/capabilities", ids.moderator)).status, 200);
});
test("group-scoped moderation cannot browse or decide other groups or global users", async () => {
  const one = randomUUID(), two = randomUUID(), modOne = randomUUID(), modTwo = randomUUID();
  for (const [id, groupId, modId] of [[one, "p16-group-a", modOne], [two, "p16-group-b", modTwo]]) {
    await db.insert(reportsTable).values({ id, reporterMemberId: ids.member, groupId, category: "harassment" });
    await db.insert(moderationRecordsTable).values({ id: modId, reportId: id, subjectMemberId: ids.member });
  }
  const queue = await call("/staff/moderation/queue", ids.scoped);
  assert.equal(queue.status, 200);
  assert.ok(queue.body.some((r: any) => r.reportId === one));
  assert.ok(!queue.body.some((r: any) => r.reportId === two));
  assert.equal((await call(`/staff/moderation/${modTwo}/decision`, ids.scoped, "POST", { state: "held", reason: "Fictional scope validation" })).status, 403);
  assert.equal((await call("/staff/ops/records/users", ids.scoped)).status, 403);
  assert.equal((await command("acknowledge_report", { targetId: one }, ids.scoped)).status, 200);
  assert.equal((await command("acknowledge_report", { targetId: two }, ids.scoped)).status, 403);
});
test("service announcements need a different publisher and explicit region; no sponsorship is hidden", async () => {
  const made = await command("create_announcement", { title: "Fictional service notice", body: "A fictional maintenance window, no health claims.", region: "AU", validUntil: new Date(Date.now()+86400000).toISOString() });
  assert.equal(made.status, 200);
  assert.equal((await command("publish_announcement", { targetId: made.body.id })).status, 409);
  assert.equal((await command("publish_announcement", { targetId: made.body.id }, ids.admin2)).status, 200);
  const read = await call("/announcements?region=AU", ids.member);
  assert.equal(read.status, 200);
  assert.equal(read.body.find((r: any) => r.id === made.body.id).sponsorshipDisclosure, null);
  assert.equal((await call("/announcements", ids.member)).status, 400);
  await command("withdraw_announcement", { targetId: made.body.id });
  assert.ok(!(await call("/announcements?region=AU", ids.member)).body.some((r: any) => r.id === made.body.id));
});
test("duty observations cannot be backdated or counted as human response guarantees", async () => {
  const started = await command("start_shift");
  assert.equal(started.status, 200);
  assert.equal((await command("heartbeat", { targetId: started.body.id }, ids.moderator)).status, 403);
  assert.equal((await command("heartbeat", { targetId: started.body.id, numericValue: 999999 })).status, 200);
  const [session] = await db.select().from(dutySessionsTable).where(eq(dutySessionsTable.id, started.body.id));
  assert.ok(session.observedSeconds < 30);
  assert.equal((await command("end_shift", { targetId: started.body.id })).status, 200);
});
test("optional measurement requires consent, rejects private text and exports structured data only", async () => {
  await db.insert(featureControlsTable).values({ key: "analytics", enabled: true, reason: "Fictional test study consent", updatedBy: ids.admin }).onConflictDoUpdate({ target: featureControlsTable.key, set: { enabled: true } });
  assert.equal((await call("/service-feedback", ids.member, "POST", { consent: false, supported: true })).status, 400);
  assert.equal((await call("/service-feedback", ids.member, "POST", { consent: true, supported: true, privateText: "must not be accepted" })).status, 400);
  assert.equal((await call("/service-feedback", ids.member, "POST", { consent: true, supported: true })).status, 200);
  assert.equal((await call("/service-tasks", ids.member, "POST", { consent: true, task: "find_support", completed: true, usedAssistiveTechnology: true, durationSeconds: 12 })).status, 200);
  const exported = await call("/profile/export", ids.member);
  assert.equal(exported.status, 200);
  assert.equal(exported.body.moduleExports.length, listDeletionHooks().length);
  assert.ok(exported.body.operationsData.feedback.some((x: any) => x.kind === "supported"));
  assert.ok(exported.body.operationsData.feedback.every((x: any) => !("body" in x)));
});
test("launch and processor approvals cannot be marked reviewed without actual evidence references", async () => {
  assert.equal((await command("record_launch_review", { targetId: "privacy_legal", region: "AU", status: "reviewed" })).status, 400);
  assert.equal((await command("record_processor_evidence", { targetId: "logs", status: "verified" })).status, 400);
  assert.equal((await command("record_launch_review", { targetId: "sustainability", region: "AU", status: "pending", title: "Fictional pending review" })).status, 200);
  const log = await db.select().from(sensitiveActionAuditTable).where(and(eq(sensitiveActionAuditTable.actorClerkUserId, ids.admin), eq(sensitiveActionAuditTable.action, "ops.record_launch_review")));
  assert.ok(log.length);
});
test("write restrictions enforce sanctions without blocking appeals/export or turning them into deletion", async () => {
  const suspended = await command("suspend_user", { targetId: ids.member });
  assert.equal(suspended.status, 200);
  assert.equal((await call("/posts", ids.member, "POST", { body: "Fictional denied content", audience: "only_me" })).status, 403);
  assert.equal((await call("/profile/export", ids.member)).status, 200);
  assert.equal((await call("/appeals", ids.member)).status, 200);
  assert.equal((await command("restore_user", { targetId: ids.member })).status, 200);
  const [m] = await db.select().from(membersTable).where(eq(membersTable.id, ids.member));
  assert.equal(m.active, true);
});
test("security reporting returns only a receipt, not a response guarantee", async () => {
  const result = await call("/security-reports", ids.member, "POST", { title: "Fictional harmless reproduction", summary: "This is a fictional security report for integration verification only." });
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "received_not_human_reviewed");
});
test("staff cannot reopen an owner-closed group or resurrect a changed closure", async () => {
  const id = randomUUID();
  await db.insert(groupsTable).values({ id, ownerMemberId: ids.member, name: "Fictional test group", category: "peer_support" });
  assert.equal((await command("suspend_group", { targetId: id })).status, 200);
  assert.equal((await command("restore_group", { targetId: id })).status, 200);
  await db.update(groupsTable).set({ status: "closed", closedAt: new Date() }).where(eq(groupsTable.id, id));
  assert.equal((await command("restore_group", { targetId: id })).status, 409);
  assert.equal((await command("record_cost", { targetId: "storage", numericValue: -1, reference: "fictional negative invoice" })).status, 400);
  assert.equal((await command("record_cost", { targetId: "storage", numericValue: 5 })).status, 400);
});
test("deletion journals every module, remains pending for processors, and never revives erased accounts", async () => {
  await db.insert(experienceDraftsTable).values({ memberId: ids.member, body: "Fictional unsent draft", audience: "only_me" });
  const requested = await call("/account/deletion", ids.member, "POST", {});
  assert.equal(requested.status, 202);
  const [r] = await db.select().from(deletionRequestsTable).where(eq(deletionRequestsTable.memberId, ids.member));
  assert.equal(r.status, "pending");
  const steps = await db.select().from(deletionStepsTable).where(eq(deletionStepsTable.requestId, r.id));
  assert.ok(steps.some(s => s.module === "processor:database_backups" && s.status === "awaiting_processor"));
  assert.equal(steps.filter(s => !s.module.startsWith("processor:")).length, listDeletionHooks().length);
  assert.ok(steps.filter(s => !s.module.startsWith("processor:")).every(s => s.status === "completed"));
  assert.equal((await db.select().from(serviceMeasurementsTable).where(eq(serviceMeasurementsTable.memberId, ids.member))).length, 0);
  assert.equal((await db.select().from(experienceDraftsTable).where(eq(experienceDraftsTable.memberId, ids.member))).length, 0);
  await executeDeletion(r.id);
  assert.equal((await command("restore_user", { targetId: ids.member })).status, 409);
  assert.equal((await call("/account/deletion", ids.member, "DELETE")).status, 403);
});
