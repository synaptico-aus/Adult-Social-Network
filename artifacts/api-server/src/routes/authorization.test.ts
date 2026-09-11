import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, pool, membersTable, staffRoleAssignmentsTable, reportsTable, moderationRecordsTable, appealsTable, evidenceAccessAuditTable } from "@workspace/db";
import { createApp } from "../app.ts";

const ids = {
  alice: `route-test-alice-${randomUUID()}`,
  bob: `route-test-bob-${randomUUID()}`,
  moderator: `route-test-moderator-${randomUUID()}`,
  editor: `route-test-editor-${randomUUID()}`,
};
const reportId = `route-test-report-${randomUUID()}`;
const recordId = `route-test-record-${randomUUID()}`;
const contentId = `route-test-content-${randomUUID()}`;

const app = createApp({
  authMiddleware: (req, _res, next) => {
    const userId = req.header("x-test-user") ?? null;
    const stale = req.header("x-test-mfa") === "stale";
    const auth = Object.assign(() => ({
        userId,
        tokenType: "session_token",
        sessionClaims: userId === ids.moderator ? { fva: [null, stale ? 6 : 1] } : undefined,
      }), { [Symbol.for("@clerk/express.auth")]: true });
    Object.assign(req, { auth });
    next();
  },
});
let server: ReturnType<typeof app.listen>;
let baseUrl = "";
async function call(path: string, options: { method?: string; user?: string; stale?: boolean; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (options.user) headers["x-test-user"] = options.user;
  if (options.stale) headers["x-test-mfa"] = "stale";
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET", headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json().catch(() => undefined) as any };
}

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await db.insert(membersTable).values([
    { id: ids.alice, clerkUserId: ids.alice, emailVerified: true },
    { id: ids.bob, clerkUserId: ids.bob, emailVerified: true },
  ]);
  await db.insert(staffRoleAssignmentsTable).values([
    { id: randomUUID(), clerkUserId: ids.moderator, role: "moderator", capabilities: [], active: true },
    { id: randomUUID(), clerkUserId: ids.editor, role: "education_editor", capabilities: [], active: true },
  ]);
  await db.insert(reportsTable).values({
    id: reportId, reporterMemberId: ids.alice, targetMemberId: ids.bob,
    contentId, category: "harassment", details: "private report",
  });
  await db.insert(moderationRecordsTable).values({
    id: recordId, reportId, contentId, subjectMemberId: ids.bob, state: "held",
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await db.delete(evidenceAccessAuditTable).where(inArray(evidenceAccessAuditTable.evidenceId, [reportId]));
  await db.delete(appealsTable).where(inArray(appealsTable.moderationRecordId, [recordId]));
  await db.delete(moderationRecordsTable).where(eq(moderationRecordsTable.id, recordId));
  await db.delete(reportsTable).where(eq(reportsTable.id, reportId));
  await db.delete(staffRoleAssignmentsTable).where(inArray(staffRoleAssignmentsTable.clerkUserId, [ids.moderator, ids.editor]));
  await db.delete(membersTable).where(inArray(membersTable.id, [ids.alice, ids.bob]));
  await pool.end();
});

test("member safety and report routes require authentication", async () => {
  for (const path of ["/api/safety/relationships", "/api/reports", "/api/appeals"]) {
    const response = await call(path);
    assert.equal(response.status, 401, path);
  }
});

test("ordinary members and stale MFA cannot use staff routes", async () => {
  assert.equal((await call("/api/staff/moderation/queue", { user: ids.alice })).status, 403);
  assert.equal((await call("/api/staff/moderation/queue", { user: ids.moderator, stale: true })).status, 403);
});

test("education editors cannot read moderation data or decide", async () => {
  assert.equal((await call("/api/staff/moderation/queue", { user: ids.editor })).status, 403);
  assert.equal((await call(`/api/staff/evidence/${reportId}/access`, { method: "POST", user: ids.editor, body: { reason: "review" } })).status, 403);
  assert.equal((await call(`/api/staff/moderation/${recordId}/decision`, { method: "POST", user: ids.editor, body: { state: "removed", reason: "decision" } })).status, 403);
});

test("member report and appeal listings are account scoped", async () => {
  const reports = await call("/api/reports", { user: ids.bob });
  assert.equal(reports.status, 200);
  assert.equal(reports.body.some((row: { report: { id: string } }) => row.report.id === reportId), false);
  const appeals = await call("/api/appeals", { user: ids.bob });
  assert.equal(appeals.status, 200);
  assert.deepEqual(appeals.body, []);
});

test("staff queue omits reporter, target, content, and details", async () => {
  const response = await call("/api/staff/moderation/queue", { user: ids.moderator });
  assert.equal(response.status, 200);
  const serialized = JSON.stringify(response.body);
  for (const secret of ["reporterMemberId", "targetMemberId", "contentId", "details"]) assert.equal(serialized.includes(secret), false);
});

test("evidence requires a reason, rejects unknown IDs, and audits scoped access", async () => {
  const base = (body: unknown) => call(`/api/staff/evidence/${contentId}/access`, { method: "POST", user: ids.moderator, body });
  assert.equal((await base({ reason: " " })).status, 400);
  assert.equal((await call("/api/staff/evidence/nonexistent/access", { method: "POST", user: ids.moderator, body: { reason: "case review" } })).status, 404);
  const allowed = await base({ reason: "case review" });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.report.id, reportId);
  const audits = await db.select().from(evidenceAccessAuditTable).where(eq(evidenceAccessAuditTable.evidenceId, reportId));
  assert.equal(audits.length, 1);
});

test("a member cannot appeal another member's moderation record", async () => {
  const response = await call("/api/appeals", { method: "POST", user: ids.alice, body: { moderationRecordId: recordId, statement: "not mine" } });
  assert.equal(response.status, 409);
});