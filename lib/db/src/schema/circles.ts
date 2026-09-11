import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const circleStatuses = ["active", "closed"] as const;
export const circleRoles = ["owner", "admin", "member"] as const;
export const circleMemberStatuses = ["active", "removed", "left"] as const;
export const circleInvitationStatuses = ["pending", "accepted", "declined", "revoked", "expired"] as const;
export const circleHistoryGrantStatuses = ["active", "revoked"] as const;

export const circlesTable = pgTable("circles", {
  id: text("id").primaryKey(),
  ownerMemberId: text("owner_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", { enum: circleStatuses }).notNull().default("active"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("circles_owner_status_idx").on(t.ownerMemberId, t.status)]);

export const circleMembersTable = pgTable("circle_members", {
  id: text("id").primaryKey(),
  circleId: text("circle_id").notNull().references(() => circlesTable.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  invitedByMemberId: text("invited_by_member_id").references(() => membersTable.id, { onDelete: "set null" }),
  role: text("role", { enum: circleRoles }).notNull().default("member"),
  status: text("status", { enum: circleMemberStatuses }).notNull().default("active"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("circle_members_unique").on(t.circleId, t.memberId), index("circle_members_member_status_idx").on(t.memberId, t.status), index("circle_members_circle_status_idx").on(t.circleId, t.status)]);

export const circleInvitationsTable = pgTable("circle_invitations", {
  id: text("id").primaryKey(),
  circleId: text("circle_id").notNull().references(() => circlesTable.id, { onDelete: "cascade" }),
  recipientMemberId: text("recipient_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  invitedByMemberId: text("invited_by_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  status: text("status", { enum: circleInvitationStatuses }).notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("circle_invites_one_pending_unique").on(t.circleId, t.recipientMemberId).where(sql`${t.status} = 'pending'`), index("circle_invites_recipient_status_idx").on(t.recipientMemberId, t.status), index("circle_invites_circle_status_idx").on(t.circleId, t.status)]);

export const circleHistoryGrantsTable = pgTable("circle_history_grants", {
  id: text("id").primaryKey(),
  circleId: text("circle_id").notNull().references(() => circlesTable.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  grantedByMemberId: text("granted_by_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  status: text("status", { enum: circleHistoryGrantStatuses }).notNull().default("active"),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [uniqueIndex("circle_history_grants_unique").on(t.circleId, t.memberId), index("circle_history_grants_member_status_idx").on(t.memberId, t.status)]);

export type Circle = typeof circlesTable.$inferSelect;
export type CircleMember = typeof circleMembersTable.$inferSelect;