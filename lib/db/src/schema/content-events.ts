import { jsonb, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { membersTable } from "./members";
export const retainedEvidenceTable = pgTable("retained_content_evidence", {
  id: text("id").primaryKey(), reportId: text("report_id").notNull(), contentId: text("content_id").notNull(),
  contentKind: text("content_kind").notNull(), authorMemberId: text("author_member_id"), bodySnapshot: text("body_snapshot").notNull(),
  policyVersion: text("policy_version").notNull(), retentionReason: text("retention_reason").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("retained_evidence_report_idx").on(t.reportId), index("retained_evidence_content_idx").on(t.contentId)]);
export const notificationEventsTable = pgTable("notification_events", {
  id: text("id").primaryKey(), eventType: text("event_type").notNull(), actorMemberId: text("actor_member_id").references(() => membersTable.id, { onDelete: "set null" }),
  recipientMemberId: text("recipient_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  postId: text("post_id"), commentId: text("comment_id"), moderationState: text("moderation_state").notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("notification_recipient_idx").on(t.recipientMemberId, t.createdAt)]);