import { registerDeletionHook } from "./deletion-hooks";
import {
  appealsTable,
  db,
  evidenceAccessAuditTable,
  moderationRecordsTable,
  reportsTable,
  safetyRelationshipsTable,
  screeningResultsTable,
  sensitiveActionAuditTable,
} from "@workspace/db";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { SAFETY_OPERATIONS_POLICY } from "./safety-operations-policy";

function cutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Daily retention job. Open, held, and appealed cases remain available for
 * operational review; resolved evidence and audit data expire on the approved
 * schedule.
 */
export async function runSafetyRetentionJob(now = new Date()): Promise<void> {
  const { retention } = SAFETY_OPERATIONS_POLICY;
  await db.transaction(async (tx) => {
    const resolvedCutoff = cutoff(now, retention.resolvedEvidenceDays);
    await tx.delete(moderationRecordsTable).where(
      and(
        inArray(moderationRecordsTable.state, ["allowed", "removed"]),
        lt(sql<Date>`coalesce(${moderationRecordsTable.resolvedAt}, ${moderationRecordsTable.createdAt})`, resolvedCutoff),
      ),
    );
    await tx.delete(reportsTable).where(
      and(
        inArray(reportsTable.status, ["allowed", "removed"]),
        lt(sql<Date>`coalesce(${reportsTable.resolvedAt}, ${reportsTable.createdAt})`, resolvedCutoff),
      ),
    );
    await tx.delete(screeningResultsTable).where(
      lt(screeningResultsTable.createdAt, cutoff(now, retention.screeningResultDays)),
    );
    await tx.delete(evidenceAccessAuditTable).where(
      lt(evidenceAccessAuditTable.occurredAt, cutoff(now, retention.evidenceAccessAuditDays)),
    );
    await tx.delete(sensitiveActionAuditTable).where(
      lt(sensitiveActionAuditTable.occurredAt, cutoff(now, retention.sensitiveActionAuditDays)),
    );
  });
}

/** Account deletion removes controls and immediately pseudonymises retained safety records. */
registerDeletionHook({
  name: "phase-4-safety-and-moderation",
  async run({ memberId }) {
    await db.transaction(async (tx) => {
      const affectedReports = await tx.select({ id: reportsTable.id, contentId: reportsTable.contentId }).from(reportsTable).where(
        or(eq(reportsTable.reporterMemberId, memberId), eq(reportsTable.targetMemberId, memberId)),
      );
      const reportIds = affectedReports.map(({ id }) => id);
      const reportLinkedRecords = reportIds.length
        ? await tx.select({ id: moderationRecordsTable.id, contentId: moderationRecordsTable.contentId }).from(moderationRecordsTable).where(inArray(moderationRecordsTable.reportId, reportIds))
        : [];
      const subjectLinkedRecords = await tx.select({ id: moderationRecordsTable.id, contentId: moderationRecordsTable.contentId })
        .from(moderationRecordsTable)
        .where(eq(moderationRecordsTable.subjectMemberId, memberId));
      const affectedRecords = [...new Map(
        [...reportLinkedRecords, ...subjectLinkedRecords].map((record) => [record.id, record]),
      ).values()];
      const recordIds = affectedRecords.map(({ id }) => id);
      const affectedAppeals = recordIds.length
        ? await tx.select({ id: appealsTable.id }).from(appealsTable).where(inArray(appealsTable.moderationRecordId, recordIds))
        : [];
      const appealIds = affectedAppeals.map(({ id }) => id);
      const contentIds = [...new Set(
        [...affectedReports, ...affectedRecords]
          .map(({ contentId }) => contentId)
          .filter((contentId): contentId is string => contentId !== null),
      )];

      if (recordIds.length) {
        await tx.update(appealsTable)
          .set({ statement: "[redacted]" })
          .where(inArray(appealsTable.moderationRecordId, recordIds));
        await tx.update(sensitiveActionAuditTable)
          .set({ subjectId: null, metadata: { pseudonymized: true } })
          .where(inArray(sensitiveActionAuditTable.subjectId, recordIds));
      }
      if (appealIds.length) {
        await tx.update(sensitiveActionAuditTable)
          .set({ subjectId: null, metadata: { pseudonymized: true } })
          .where(inArray(sensitiveActionAuditTable.subjectId, appealIds));
      }
      if (reportIds.length) {
        await tx.update(evidenceAccessAuditTable)
          .set({ evidenceId: "[redacted]", reason: "[redacted]" })
          .where(inArray(evidenceAccessAuditTable.evidenceId, reportIds));
        await tx.update(moderationRecordsTable)
          .set({ contentId: null, subjectMemberId: null, decision: null, reason: null })
          .where(inArray(moderationRecordsTable.reportId, reportIds));
      }
      if (contentIds.length) {
        await tx.update(screeningResultsTable)
          .set({ contentId: "[redacted]", details: null })
          .where(inArray(screeningResultsTable.contentId, contentIds));
      }
      await tx.delete(safetyRelationshipsTable).where(eq(safetyRelationshipsTable.actorMemberId, memberId));
      await tx.delete(safetyRelationshipsTable).where(eq(safetyRelationshipsTable.targetMemberId, memberId));
      await tx.update(reportsTable)
        .set({ reporterMemberId: null, contentId: null, details: null })
        .where(eq(reportsTable.reporterMemberId, memberId));
      await tx.update(reportsTable)
        .set({ targetMemberId: null, contentId: null, details: null })
        .where(eq(reportsTable.targetMemberId, memberId));
      await tx.update(moderationRecordsTable)
        .set({ subjectMemberId: null, contentId: null, decision: null, reason: null })
        .where(eq(moderationRecordsTable.subjectMemberId, memberId));
      await tx.update(appealsTable).set({ appellantMemberId: null, statement: "[redacted]" }).where(eq(appealsTable.appellantMemberId, memberId));
    });
  },
});