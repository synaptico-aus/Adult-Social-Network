import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, featureControlsTable, operationalCountersTable, operationsRecordsTable, sensitiveActionAuditTable, staffRoleAssignmentsTable, membersTable } from "@workspace/db";
import type { RequestHandler } from "express";
import { getAuth } from "@clerk/express";

export const controlKeys = ["uploads", "video_processing", "posting", "messaging", "announcements", "analytics"] as const;
export const budgetDefaults: Record<string, number> = { backlog: 50, urgent_age_minutes: 15, upload_daily_bytes: 1073741824, storage_bytes: 10737418240, failures_hour: 20, abuse_percent: 10, cost_usd_monthly: 25 };
export async function featureEnabled(key: string) {
  const [row] = await db.select().from(featureControlsTable).where(eq(featureControlsTable.key, key));
  return row?.enabled ?? key !== "analytics";
}
export async function countOperational(key: string, amount = 1) {
  await db.insert(operationalCountersTable).values({ key, count: amount }).onConflictDoUpdate({
    target: operationalCountersTable.key, set: { count: sql`${operationalCountersTable.count} + ${amount}`, updatedAt: new Date() },
  });
}
export async function auditOperation(actor: string, action: string, subjectId: string | null, metadata: Record<string, unknown> = {}) {
  await db.insert(sensitiveActionAuditTable).values({ id: randomUUID(), actorClerkUserId: actor, action, subjectId, metadata });
}
export async function accessReviewCurrent(assignment: typeof staffRoleAssignmentsTable.$inferSelect, now = new Date()) {
  const [review] = await db.select().from(operationsRecordsTable).where(and(eq(operationsRecordsTable.kind, "access"), eq(operationsRecordsTable.targetId, assignment.id), sql`${operationsRecordsTable.createdAt} >= ${assignment.createdAt}`)).orderBy(desc(operationsRecordsTable.createdAt)).limit(1);
  if (review) return review.status === "reviewed" && review.actorClerkUserId !== assignment.clerkUserId && !!review.validUntil && review.validUntil > now;
  // Initial assignment grace is not described as an independent access review.
  return now.getTime() - assignment.createdAt.getTime() < 30 * 86400000;
}
export const operationalFeatureGate: RequestHandler = async (req, res, next) => {
  if (!["POST", "PUT", "PATCH"].includes(req.method)) { next(); return; }
  const path = req.path;
  if (!/^\/(?:reports|appeals|safety|account|security-reports|service-feedback|service-tasks)(?:\/|$)/.test(path)) {
    const userId = getAuth(req).userId;
    if (userId) {
      const [member] = await db.select().from(membersTable).where(eq(membersTable.clerkUserId, userId));
      if (member) {
        const restricted = await db.execute(sql`select m.id from moderation_records m where m.subject_member_id=${member.id}
          and m.state in ('held','removed','appealed') and m.sanction in ('temporary_restriction','suspension','permanent_removal')
          and (m.sanction <> 'temporary_restriction' or exists(select 1 from operations_records o where o.kind='sanctions' and o.target_id=m.id and o.valid_until>now())) limit 1`);
        if (restricted.rows.length) { res.status(403).json({ error: "Content changes are restricted. Reading, appeals and data rights remain available.", moderationRecordId: restricted.rows[0].id }); return; }
      }
    }
  }
  const feature = /^\/media\/uploads.*(request|complete|retry)$/.test(path) || /\/profile\/photo.*upload/.test(path) ? "uploads"
    : /^\/posts(?:\/[^/]+(?:\/(?:publish|comments))?)?$/.test(path) ? "posting"
    : /\/(?:conversations\/[^/]+\/messages|message-requests)(?:\/[^/]+)?$/.test(path) ? "messaging" : null;
  if (!feature) { next(); return; }
  try {
    if (!(await featureEnabled(feature))) { res.status(503).json({ error: "This feature is temporarily paused by the safety team" }); return; }
    next();
  } catch { res.status(503).json({ error: "Feature safety controls are unavailable; changes are paused" }); }
};
