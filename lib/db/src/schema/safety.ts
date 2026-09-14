import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const relationshipKinds = ["block", "mute", "restrict"] as const;
export const reportCategories = ["harassment", "threats", "exploitation", "scams", "impersonation", "hateful_content", "dangerous_medical_claims", "distress_disclosure", "respectful_disagreement"] as const;
export const moderationStates = ["pending", "allowed", "held", "removed", "appealed"] as const;
export const staffRoles = ["administrator", "moderator", "education_editor"] as const;

export const safetyRelationshipsTable = pgTable("safety_relationships", {
  id: text("id").primaryKey(), actorMemberId: text("actor_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  targetMemberId: text("target_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: relationshipKinds }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("safety_relationship_actor_idx").on(t.actorMemberId), index("safety_relationship_target_idx").on(t.targetMemberId), uniqueIndex("safety_relationship_unique").on(t.actorMemberId, t.targetMemberId, t.kind)]);

export const reportsTable = pgTable("reports", {
  id: text("id").primaryKey(), reporterMemberId: text("reporter_member_id").references(() => membersTable.id, { onDelete: "set null" }),
  targetMemberId: text("target_member_id").references(() => membersTable.id, { onDelete: "set null" }),
  contentTargetType: text("content_target_type"),
  groupId: text("group_id"),
  contentId: text("content_id"), category: text("category", { enum: reportCategories }).notNull(), details: text("details"),
  status: text("status", { enum: moderationStates }).notNull().default("pending"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("reports_reporter_idx").on(t.reporterMemberId, t.createdAt), index("reports_queue_idx").on(t.status, t.createdAt)]);

export const moderationRecordsTable = pgTable("moderation_records", {
  id: text("id").primaryKey(), reportId: text("report_id").references(() => reportsTable.id, { onDelete: "set null" }),
  contentId: text("content_id"), subjectMemberId: text("subject_member_id").references(() => membersTable.id, { onDelete: "set null" }),
  state: text("state", { enum: moderationStates }).notNull().default("pending"), decision: text("decision"), sanction: text("sanction"),
  decidedBy: text("decided_by"), reason: text("reason"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("moderation_records_state_idx").on(t.state, t.createdAt)]);

export const appealsTable = pgTable("appeals", {
  id: text("id").primaryKey(), moderationRecordId: text("moderation_record_id").notNull().references(() => moderationRecordsTable.id, { onDelete: "cascade" }),
  appellantMemberId: text("appellant_member_id").references(() => membersTable.id, { onDelete: "set null" }),
  statement: text("statement").notNull(), status: text("status", { enum: ["pending", "allowed", "removed"] }).notNull().default("pending"),
  reviewedBy: text("reviewed_by"), reviewedAt: timestamp("reviewed_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("appeals_appellant_idx").on(t.appellantMemberId, t.createdAt), uniqueIndex("appeals_record_member_unique").on(t.moderationRecordId, t.appellantMemberId)]);

export const staffRoleAssignmentsTable = pgTable("staff_role_assignments", {
  id: text("id").primaryKey(), clerkUserId: text("clerk_user_id").notNull(), role: text("role", { enum: staffRoles }).notNull(),
  capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]), active: boolean("active").notNull().default(true),
  assignedBy: text("assigned_by"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("staff_assignments_user_idx").on(t.clerkUserId, t.active), uniqueIndex("staff_assignments_user_unique").on(t.clerkUserId)]);

export const sensitiveActionAuditTable = pgTable("sensitive_action_audit", {
  id: text("id").primaryKey(), actorClerkUserId: text("actor_clerk_user_id").notNull(), action: text("action").notNull(),
  subjectId: text("subject_id"), metadata: jsonb("metadata"), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});
export const evidenceAccessAuditTable = pgTable("evidence_access_audit", {
  id: text("id").primaryKey(), actorClerkUserId: text("actor_clerk_user_id").notNull(), evidenceId: text("evidence_id").notNull(),
  reason: text("reason").notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});
export const screeningResultsTable = pgTable("screening_results", {
  id: text("id").primaryKey(), contentId: text("content_id").notNull(), kind: text("kind").notNull(),
  result: text("result").notNull(), provider: text("provider").notNull().default("deterministic-default"), details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("screening_content_idx").on(t.contentId, t.createdAt)]);

export type SafetyRelationship = typeof safetyRelationshipsTable.$inferSelect;
export type Report = typeof reportsTable.$inferSelect;
export type ModerationRecord = typeof moderationRecordsTable.$inferSelect;