import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  appealsTable,
  db,
  evidenceAccessAuditTable,
  membersTable,
  moderationRecordsTable,
  reportsTable,
  screeningResultsTable,
  sensitiveActionAuditTable,
} from "@workspace/db";
import { runDeletionHooks } from "./deletion-hooks";
import { runSafetyRetentionJob } from "./safety-deletion-hook";

test("retention uses resolution time and preserves unresolved cases", async () => {
  const memberId = `retention-member-${randomUUID()}`;
  const oldResolvedReport = `old-resolved-report-${randomUUID()}`;
  const recentResolvedReport = `recent-resolved-report-${randomUUID()}`;
  const unresolvedReport = `unresolved-report-${randomUUID()}`;
  const legacyResolvedReport = `legacy-resolved-report-${randomUUID()}`;
  const old = new Date("2024-01-01T00:00:00.000Z");
  const recent = new Date("2026-08-01T00:00:00.000Z");
  await db.insert(membersTable).values({ id: memberId, clerkUserId: memberId, emailVerified: true });
  await db.insert(reportsTable).values([
    { id: oldResolvedReport, reporterMemberId: memberId, category: "harassment", status: "removed", createdAt: old, resolvedAt: old },
    { id: recentResolvedReport, reporterMemberId: memberId, category: "harassment", status: "removed", createdAt: old, resolvedAt: recent },
    { id: unresolvedReport, reporterMemberId: memberId, category: "harassment", status: "appealed", createdAt: old },
    { id: legacyResolvedReport, reporterMemberId: memberId, category: "harassment", status: "allowed", createdAt: old },
  ]);
  await db.insert(moderationRecordsTable).values([
    { id: `record-${oldResolvedReport}`, reportId: oldResolvedReport, state: "removed", createdAt: old, resolvedAt: old },
    { id: `record-${recentResolvedReport}`, reportId: recentResolvedReport, state: "removed", createdAt: old, resolvedAt: recent },
    { id: `record-${unresolvedReport}`, reportId: unresolvedReport, contentId: unresolvedReport, state: "appealed", createdAt: old },
    { id: `record-${legacyResolvedReport}`, reportId: legacyResolvedReport, state: "allowed", createdAt: old },
  ]);

  try {
    await runSafetyRetentionJob(new Date("2026-09-11T00:00:00.000Z"));
    const remaining = await db.select({ id: reportsTable.id }).from(reportsTable).where(
      inArray(reportsTable.id, [oldResolvedReport, recentResolvedReport, unresolvedReport, legacyResolvedReport]),
    );
    assert.deepEqual(new Set(remaining.map(({ id }) => id)), new Set([recentResolvedReport, unresolvedReport]));
  } finally {
    await db.delete(moderationRecordsTable).where(inArray(moderationRecordsTable.reportId, [oldResolvedReport, recentResolvedReport, unresolvedReport, legacyResolvedReport]));
    await db.delete(reportsTable).where(inArray(reportsTable.id, [oldResolvedReport, recentResolvedReport, unresolvedReport, legacyResolvedReport]));
    await db.delete(membersTable).where(eq(membersTable.id, memberId));
  }
});

test("account deletion pseudonymises links and all case free text", async () => {
  const memberId = `pseudonym-member-${randomUUID()}`;
  const reporterId = `pseudonym-reporter-${randomUUID()}`;
  const reportId = `pseudonym-report-${randomUUID()}`;
  const recordId = `pseudonym-record-${randomUUID()}`;
  const appealId = `pseudonym-appeal-${randomUUID()}`;
  const evidenceAuditId = `pseudonym-evidence-audit-${randomUUID()}`;
  const screeningId = `pseudonym-screening-${randomUUID()}`;
  const moderationAuditId = `pseudonym-moderation-audit-${randomUUID()}`;
  const appealAuditId = `pseudonym-appeal-audit-${randomUUID()}`;
  await db.insert(membersTable).values([
    { id: memberId, clerkUserId: memberId, emailVerified: true },
    { id: reporterId, clerkUserId: reporterId, emailVerified: true },
  ]);
  await db.insert(reportsTable).values({ id: reportId, reporterMemberId: reporterId, targetMemberId: memberId, contentId: "identifying-content", category: "harassment", details: "identifying report text" });
  await db.insert(moderationRecordsTable).values({ id: recordId, reportId, subjectMemberId: memberId, contentId: "identifying-content", state: "appealed", decision: "identifying decision", reason: "identifying reason" });
  await db.insert(appealsTable).values({ id: appealId, moderationRecordId: recordId, appellantMemberId: memberId, statement: "identifying appeal" });
  await db.insert(evidenceAccessAuditTable).values({ id: evidenceAuditId, actorClerkUserId: "staff", evidenceId: reportId, reason: "identifying access reason" });
  await db.insert(screeningResultsTable).values({ id: screeningId, contentId: "identifying-content", kind: "media", result: "held", details: { identifying: "screening details" } });
  await db.insert(sensitiveActionAuditTable).values([
    { id: moderationAuditId, actorClerkUserId: "staff", action: "moderation.decision", subjectId: recordId, metadata: { reason: "identifying moderation audit" } },
    { id: appealAuditId, actorClerkUserId: "staff", action: "appeal.review", subjectId: appealId, metadata: { reason: "identifying appeal audit" } },
  ]);

  try {
    await runDeletionHooks({ memberId, requestId: randomUUID() });
    const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, reportId));
    const [record] = await db.select().from(moderationRecordsTable).where(eq(moderationRecordsTable.id, recordId));
    const [appeal] = await db.select().from(appealsTable).where(eq(appealsTable.id, appealId));
    const [evidenceAudit] = await db.select().from(evidenceAccessAuditTable).where(eq(evidenceAccessAuditTable.id, evidenceAuditId));
    const [screening] = await db.select().from(screeningResultsTable).where(eq(screeningResultsTable.id, screeningId));
    const audits = await db.select().from(sensitiveActionAuditTable).where(inArray(sensitiveActionAuditTable.id, [moderationAuditId, appealAuditId]));
    assert.equal(report.targetMemberId, null);
    assert.equal(report.contentId, null);
    assert.equal(report.details, null);
    assert.equal(record.subjectMemberId, null);
    assert.equal(record.contentId, null);
    assert.equal(record.decision, null);
    assert.equal(record.reason, null);
    assert.equal(appeal.appellantMemberId, null);
    assert.equal(appeal.statement, "[redacted]");
    assert.equal(evidenceAudit.evidenceId, "[redacted]");
    assert.equal(evidenceAudit.reason, "[redacted]");
    assert.equal(screening.contentId, "[redacted]");
    assert.equal(screening.details, null);
    assert.equal(audits.length, 2);
    for (const audit of audits) {
      assert.equal(audit.subjectId, null);
      assert.deepEqual(audit.metadata, { pseudonymized: true });
    }
  } finally {
    await db.delete(sensitiveActionAuditTable).where(inArray(sensitiveActionAuditTable.id, [moderationAuditId, appealAuditId]));
    await db.delete(screeningResultsTable).where(eq(screeningResultsTable.id, screeningId));
    await db.delete(evidenceAccessAuditTable).where(eq(evidenceAccessAuditTable.id, evidenceAuditId));
    await db.delete(appealsTable).where(eq(appealsTable.id, appealId));
    await db.delete(moderationRecordsTable).where(eq(moderationRecordsTable.id, recordId));
    await db.delete(reportsTable).where(eq(reportsTable.id, reportId));
    await db.delete(membersTable).where(inArray(membersTable.id, [memberId, reporterId]));
  }
});

test("account deletion pseudonymises reportless moderation intake data", async () => {
  const memberId = `reportless-member-${randomUUID()}`;
  const recordId = `reportless-record-${randomUUID()}`;
  const appealId = `reportless-appeal-${randomUUID()}`;
  const screeningId = `reportless-screening-${randomUUID()}`;
  const auditId = `reportless-audit-${randomUUID()}`;
  const contentId = `reportless-content-${randomUUID()}`;
  await db.insert(membersTable).values({ id: memberId, clerkUserId: memberId, emailVerified: true });
  await db.insert(moderationRecordsTable).values({
    id: recordId,
    subjectMemberId: memberId,
    contentId,
    state: "appealed",
    decision: "identifying reportless decision",
    reason: "identifying reportless reason",
  });
  await db.insert(appealsTable).values({
    id: appealId,
    moderationRecordId: recordId,
    appellantMemberId: memberId,
    statement: "identifying reportless appeal",
  });
  await db.insert(screeningResultsTable).values({
    id: screeningId,
    contentId,
    kind: "media",
    result: "held",
    details: { identifying: "reportless screening details" },
  });
  await db.insert(sensitiveActionAuditTable).values({
    id: auditId,
    actorClerkUserId: "staff",
    action: "moderation.decision",
    subjectId: recordId,
    metadata: { reason: "identifying reportless audit" },
  });

  try {
    await runDeletionHooks({ memberId, requestId: randomUUID() });
    const [record] = await db.select().from(moderationRecordsTable).where(eq(moderationRecordsTable.id, recordId));
    const [appeal] = await db.select().from(appealsTable).where(eq(appealsTable.id, appealId));
    const [screening] = await db.select().from(screeningResultsTable).where(eq(screeningResultsTable.id, screeningId));
    const [audit] = await db.select().from(sensitiveActionAuditTable).where(eq(sensitiveActionAuditTable.id, auditId));
    assert.equal(record.subjectMemberId, null);
    assert.equal(record.contentId, null);
    assert.equal(record.decision, null);
    assert.equal(record.reason, null);
    assert.equal(appeal.appellantMemberId, null);
    assert.equal(appeal.statement, "[redacted]");
    assert.equal(screening.contentId, "[redacted]");
    assert.equal(screening.details, null);
    assert.equal(audit.subjectId, null);
    assert.deepEqual(audit.metadata, { pseudonymized: true });
  } finally {
    await db.delete(sensitiveActionAuditTable).where(eq(sensitiveActionAuditTable.id, auditId));
    await db.delete(screeningResultsTable).where(eq(screeningResultsTable.id, screeningId));
    await db.delete(appealsTable).where(eq(appealsTable.id, appealId));
    await db.delete(moderationRecordsTable).where(eq(moderationRecordsTable.id, recordId));
    await db.delete(membersTable).where(eq(membersTable.id, memberId));
  }
});
