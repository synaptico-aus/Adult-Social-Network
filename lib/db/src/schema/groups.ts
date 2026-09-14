import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

export const groupStatuses = ["active", "closed"] as const;
export const groupDiscoverabilities = ["public", "private"] as const;
export const groupContentVisibilities = ["public", "members"] as const;
export const groupJoinPolicies = ["open", "approval", "closed"] as const;
export const groupRoles = ["owner", "moderator", "member"] as const;
export const groupMemberStatuses = ["active", "left", "removed"] as const;
export const groupRequestStatuses = ["pending", "approved", "declined", "cancelled"] as const;
export const groupWelcomeStatuses = ["open", "acknowledged", "closed", "rejected"] as const;

/**
 * Governance-owned training records are deliberately independent of any
 * group. Group managers may assign a trained community host, but cannot
 * create or certify this record through a group endpoint.
 */
export const communityHostTrainingTable = pgTable("community_host_training", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  trainedAt: timestamp("trained_at", { withTimezone: true }).notNull(),
  active: boolean("active").notNull().default(true),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  provenance: text("provenance").notNull(),
  auditedBy: text("audited_by"),
  auditNotes: text("audit_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("community_host_training_member_active_idx").on(t.memberId, t.active), index("community_host_training_active_idx").on(t.active, t.trainedAt)]);

export const groupsTable = pgTable("groups", {
  id: text("id").primaryKey(),
  ownerMemberId: text("owner_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  rules: text("rules"),
  suggestionTags: jsonb("suggestion_tags").$type<string[]>().notNull().default([]),
  discoverability: text("discoverability", { enum: groupDiscoverabilities }).notNull().default("public"),
  contentVisibility: text("content_visibility", { enum: groupContentVisibilities }).notNull().default("members"),
  joinPolicy: text("join_policy", { enum: groupJoinPolicies }).notNull().default("open"),
  welcomeEnabled: boolean("welcome_enabled").notNull().default(false),
  welcomeAvailabilityText: text("welcome_availability_text"),
  status: text("status", { enum: groupStatuses }).notNull().default("active"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("groups_discovery_status_idx").on(t.discoverability, t.status), index("groups_owner_status_idx").on(t.ownerMemberId, t.status), index("groups_category_idx").on(t.category)]);

export const groupMembersTable = pgTable("group_members", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  role: text("role", { enum: groupRoles }).notNull().default("member"),
  status: text("status", { enum: groupMemberStatuses }).notNull().default("active"),
  muted: boolean("muted").notNull().default(false),
  mutedAt: timestamp("muted_at", { withTimezone: true }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  leftAt: timestamp("left_at", { withTimezone: true }),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("group_members_group_member_unique").on(t.groupId, t.memberId), index("group_members_group_status_idx").on(t.groupId, t.status), index("group_members_member_status_idx").on(t.memberId, t.status)]);

export const groupMembershipRequestsTable = pgTable("group_membership_requests", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  status: text("status", { enum: groupRequestStatuses }).notNull().default("pending"),
  reviewedByMemberId: text("reviewed_by_member_id").references(() => membersTable.id, { onDelete: "set null" }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("group_requests_one_pending").on(t.groupId, t.memberId).where(sql`${t.status} = 'pending'`), index("group_requests_group_status_idx").on(t.groupId, t.status), index("group_requests_member_status_idx").on(t.memberId, t.status)]);

export const groupCategoriesTable = pgTable("group_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  developmentOnly: boolean("development_only").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupResourcesTable = pgTable("group_resources", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
  createdByMemberId: text("created_by_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  pinOrder: integer("pin_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("group_resources_group_order_idx").on(t.groupId, t.pinOrder)]);

export const groupHostAssignmentsTable = pgTable("group_host_assignments", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
  hostMemberId: text("host_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  assignedByMemberId: text("assigned_by_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  trainingId: text("training_id").notNull().references(() => communityHostTrainingTable.id, { onDelete: "restrict" }),
  trainedAt: timestamp("trained_at", { withTimezone: true }).notNull(),
  active: boolean("active").notNull().default(true),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("group_host_assignment_unique").on(t.groupId, t.hostMemberId), index("group_host_group_active_idx").on(t.groupId, t.active)]);

export const groupWelcomeRequestsTable = pgTable("group_welcome_requests", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  introductionText: text("introduction_text"),
  status: text("status", { enum: groupWelcomeStatuses }).notNull().default("open"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedByMemberId: text("acknowledged_by_member_id").references(() => membersTable.id, { onDelete: "set null" }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (t) => [uniqueIndex("group_welcome_one_active").on(t.groupId, t.memberId).where(sql`${t.status} in ('open', 'acknowledged')`), index("group_welcome_group_status_idx").on(t.groupId, t.status, t.requestedAt)]);

export const insertGroupSchema = createInsertSchema(groupsTable);
export const insertCommunityHostTrainingSchema = createInsertSchema(communityHostTrainingTable);
export type Group = typeof groupsTable.$inferSelect;
export type CommunityHostTraining = typeof communityHostTrainingTable.$inferSelect;
export type InsertCommunityHostTraining = z.infer<typeof insertCommunityHostTrainingSchema>;
export type GroupMember = typeof groupMembersTable.$inferSelect;
export type GroupMembershipRequest = typeof groupMembershipRequestsTable.$inferSelect;
export type GroupResource = typeof groupResourcesTable.$inferSelect;
export type GroupHostAssignment = typeof groupHostAssignmentsTable.$inferSelect;
export type GroupWelcomeRequest = typeof groupWelcomeRequestsTable.$inferSelect;
export type InsertGroup = z.infer<typeof insertGroupSchema>;