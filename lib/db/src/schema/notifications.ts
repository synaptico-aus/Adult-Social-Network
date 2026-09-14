import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

export const notificationKinds = ["message", "request", "group_activity", "safety", "post", "system"] as const;
export const lockScreenPreviewModes = ["private", "generic", "off"] as const;
export const notificationDeliveryStatuses = ["pending", "retrying", "sent", "failed_expired", "blocked_unconfigured", "suppressed_quiet_hours"] as const;
export const deviceRegistrationKinds = ["browser_push", "native_push"] as const;

export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey(),
  recipientMemberId: text("recipient_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  actorMemberId: text("actor_member_id").references(() => membersTable.id, { onDelete: "set null" }),
  kind: text("kind", { enum: notificationKinds }).notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  deepLink: text("deep_link"),
  conversationId: text("conversation_id"),
  messageId: text("message_id"),
  postId: text("post_id"),
  dedupKey: text("dedup_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("notifications_recipient_dedup_unique").on(t.recipientMemberId, t.dedupKey),
  index("notifications_recipient_created_idx").on(t.recipientMemberId, t.createdAt, t.id),
  index("notifications_recipient_unread_idx").on(t.recipientMemberId, t.readAt),
]);

export const notificationPreferencesTable = pgTable("notification_preferences", {
  memberId: text("member_id").primaryKey().references(() => membersTable.id, { onDelete: "cascade" }),
  inAppMessages: boolean("in_app_messages").notNull().default(true),
  browserMessages: boolean("browser_messages").notNull().default(true),
  nativeMessages: boolean("native_messages").notNull().default(true),
  inAppRequests: boolean("in_app_requests").notNull().default(true),
  browserRequests: boolean("browser_requests").notNull().default(true),
  nativeRequests: boolean("native_requests").notNull().default(true),
  inAppGroupActivity: boolean("in_app_group_activity").notNull().default(true),
  browserGroupActivity: boolean("browser_group_activity").notNull().default(true),
  nativeGroupActivity: boolean("native_group_activity").notNull().default(true),
  inAppSafety: boolean("in_app_safety").notNull().default(true),
  browserSafety: boolean("browser_safety").notNull().default(true),
  nativeSafety: boolean("native_safety").notNull().default(true),
  quietHoursEnabled: boolean("quiet_hours_enabled").notNull().default(false),
  quietHoursStart: text("quiet_hours_start"),
  quietHoursEnd: text("quiet_hours_end"),
  quietHoursTimezone: text("quiet_hours_timezone"),
  lockScreenPreview: text("lock_screen_preview", { enum: lockScreenPreviewModes }).notNull().default("generic"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const deviceRegistrationsTable = pgTable("device_registrations", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: deviceRegistrationKinds }).notNull(),
  tokenOrEndpoint: text("token_or_endpoint").notNull(),
  platform: text("platform").notNull(),
  accountSessionDeviceId: text("account_session_device_id").notNull(),
  clerkSessionId: text("clerk_session_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("device_registration_member_token_unique").on(t.memberId, t.tokenOrEndpoint),
  uniqueIndex("device_registration_token_global_unique").on(t.tokenOrEndpoint),
  index("device_registration_member_active_idx").on(t.memberId, t.active),
  index("device_registration_clerk_session_idx").on(t.clerkSessionId, t.active),
  index("device_registration_expiry_idx").on(t.expiresAt),
]);

export const notificationDeliveryQueueTable = pgTable("notification_delivery_queue", {
  id: text("id").primaryKey(),
  notificationId: text("notification_id").notNull().references(() => notificationsTable.id, { onDelete: "cascade" }),
  registrationId: text("registration_id").notNull().references(() => deviceRegistrationsTable.id, { onDelete: "cascade" }),
  dedupKey: text("dedup_key").notNull(),
  status: text("status", { enum: notificationDeliveryStatuses }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  providerMessageId: text("provider_message_id"),
  lastErrorCode: text("last_error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("notification_delivery_dedup_unique").on(t.registrationId, t.dedupKey),
  index("notification_delivery_pending_idx").on(t.status, t.nextAttemptAt),
]);

export const insertNotificationSchema = createInsertSchema(notificationsTable);
export const insertNotificationPreferenceSchema = createInsertSchema(notificationPreferencesTable);
export const insertDeviceRegistrationSchema = createInsertSchema(deviceRegistrationsTable);
export type Notification = typeof notificationsTable.$inferSelect;
export type NotificationPreference = typeof notificationPreferencesTable.$inferSelect;
export type DeviceRegistration = typeof deviceRegistrationsTable.$inferSelect;
export type NotificationDeliveryQueueItem = typeof notificationDeliveryQueueTable.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferenceSchema>;
export type InsertDeviceRegistration = z.infer<typeof insertDeviceRegistrationSchema>;