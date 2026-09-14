import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";
import { mediaAssetsTable } from "./media";

export const conversationKinds = ["direct", "group"] as const;
export const conversationStatuses = ["active", "closed"] as const;
export const conversationMemberRoles = ["owner", "admin", "member"] as const;
export const conversationMemberStatuses = ["active", "left", "removed"] as const;
export const messageRequestStatuses = ["pending", "accepted", "declined", "cancelled"] as const;
export const messageStatuses = ["active", "deleted_for_everyone"] as const;
export const messageContactSettings = ["friends_only", "friends_and_group_members", "any_member_requests"] as const;

export const messageContactSettingsTable = pgTable("message_contact_settings", {
  memberId: text("member_id").primaryKey().references(() => membersTable.id, { onDelete: "cascade" }),
  setting: text("setting", { enum: messageContactSettings }).notNull().default("friends_only"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/** A conversation is not an authorization grant. Every read and write checks live memberships below. */
export const conversationsTable = pgTable("conversations", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: conversationKinds }).notNull(),
  status: text("status", { enum: conversationStatuses }).notNull().default("active"),
  memberAId: text("member_a_id").references(() => membersTable.id, { onDelete: "cascade" }),
  memberBId: text("member_b_id").references(() => membersTable.id, { onDelete: "cascade" }),
  groupId: text("group_id"),
  title: text("title"),
  createdByMemberId: text("created_by_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("conversations_active_direct_pair_unique").on(t.memberAId, t.memberBId).where(sql`${t.kind} = 'direct' and ${t.status} = 'active'`),
  check("conversations_direct_canonical_pair", sql`${t.kind} <> 'direct' or (${t.memberAId} is not null and ${t.memberBId} is not null and ${t.memberAId} < ${t.memberBId})`),
  index("conversations_created_idx").on(t.createdAt),
]);

export const conversationMembersTable = pgTable("conversation_members", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  role: text("role", { enum: conversationMemberRoles }).notNull().default("member"),
  status: text("status", { enum: conversationMemberStatuses }).notNull().default("active"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  leftAt: timestamp("left_at", { withTimezone: true }),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("conversation_member_unique").on(t.conversationId, t.memberId),
  index("conversation_member_live_idx").on(t.memberId, t.status),
  index("conversation_member_conversation_idx").on(t.conversationId, t.status),
]);

export const messageRequestsTable = pgTable("message_requests", {
  id: text("id").primaryKey(),
  senderMemberId: text("sender_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  recipientMemberId: text("recipient_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  memberAId: text("member_a_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  memberBId: text("member_b_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  status: text("status", { enum: messageRequestStatuses }).notNull().default("pending"),
  body: text("body").notNull(),
  mediaAssetIds: jsonb("media_asset_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
}, (t) => [
  uniqueIndex("message_request_pending_pair_unique").on(t.memberAId, t.memberBId).where(sql`${t.status} = 'pending'`),
  check("message_request_canonical_pair", sql`${t.memberAId} < ${t.memberBId}`),
  index("message_request_recipient_status_idx").on(t.recipientMemberId, t.status, t.createdAt),
  index("message_request_sender_status_idx").on(t.senderMemberId, t.status, t.createdAt),
]);

export const messagesTable = pgTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  senderMemberId: text("sender_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  body: text("body"),
  mediaAssetIds: jsonb("media_asset_ids").$type<string[]>().notNull().default([]),
  status: text("status", { enum: messageStatuses }).notNull().default("active"),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedForEveryoneAt: timestamp("deleted_for_everyone_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("message_sender_idempotency_unique").on(t.senderMemberId, t.idempotencyKey),
  index("message_conversation_chronological_idx").on(t.conversationId, t.createdAt, t.id),
  index("message_sender_created_idx").on(t.senderMemberId, t.createdAt),
  check("message_has_body_or_media", sql`${t.status} = 'deleted_for_everyone' or ${t.body} is not null or jsonb_array_length(${t.mediaAssetIds}) > 0`),
]);

/** Explicit references make attachment context auditable and prevent accidental reuse. */
export const messageMediaAttachmentsTable = pgTable("message_media_attachments", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull().references(() => messagesTable.id, { onDelete: "cascade" }),
  assetId: text("asset_id").notNull().references(() => mediaAssetsTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("message_media_attachment_asset_unique").on(t.assetId),
  uniqueIndex("message_media_attachment_message_asset_unique").on(t.messageId, t.assetId),
]);

export const messageMemberRemovalsTable = pgTable("message_member_removals", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull().references(() => messagesTable.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  removedAt: timestamp("removed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("message_member_removal_unique").on(t.messageId, t.memberId), index("message_member_removal_member_idx").on(t.memberId, t.removedAt)]);

export const messageReportsTable = pgTable("message_reports", {
  id: text("id").primaryKey(),
  reportId: text("report_id").notNull().unique(),
  messageId: text("message_id").notNull().references(() => messagesTable.id, { onDelete: "restrict" }),
  reporterMemberId: text("reporter_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  bodySnapshot: text("body_snapshot"),
  mediaAssetIdsSnapshot: jsonb("media_asset_ids_snapshot").$type<string[]>().notNull().default([]),
  conversationIdSnapshot: text("conversation_id_snapshot").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("message_report_member_message_unique").on(t.reporterMemberId, t.messageId),
  index("message_report_message_idx").on(t.messageId),
]);

export const messageReportContextTable = pgTable("message_report_context", {
  id: text("id").primaryKey(),
  messageReportId: text("message_report_id").notNull().references(() => messageReportsTable.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull(),
  senderMemberId: text("sender_member_id").notNull(),
  bodySnapshot: text("body_snapshot"),
  mediaAssetIdsSnapshot: jsonb("media_asset_ids_snapshot").$type<string[]>().notNull().default([]),
  position: integer("position").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("message_report_context_report_idx").on(t.messageReportId, t.position)]);

export const insertConversationSchema = createInsertSchema(conversationsTable);
export const insertConversationMemberSchema = createInsertSchema(conversationMembersTable);
export const insertMessageRequestSchema = createInsertSchema(messageRequestsTable);
export const insertMessageSchema = createInsertSchema(messagesTable);
export type Conversation = typeof conversationsTable.$inferSelect;
export type ConversationMember = typeof conversationMembersTable.$inferSelect;
export type MessageRequest = typeof messageRequestsTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
export type MessageMediaAttachment = typeof messageMediaAttachmentsTable.$inferSelect;
export type MessageReport = typeof messageReportsTable.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type InsertConversationMember = z.infer<typeof insertConversationMemberSchema>;
export type InsertMessageRequest = z.infer<typeof insertMessageRequestSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;