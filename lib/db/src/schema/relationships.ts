import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const friendRequestStatuses = ["pending", "declined"] as const;
export const friendRequestsTable = pgTable("friend_requests", {
  id: text("id").primaryKey(),
  requesterMemberId: text("requester_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  recipientMemberId: text("recipient_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  memberAId: text("member_a_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  memberBId: text("member_b_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  status: text("status", { enum: friendRequestStatuses }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("friend_requests_pair_unique").on(t.memberAId, t.memberBId), check("friend_requests_canonical_pair", sql`${t.memberAId} < ${t.memberBId}`), index("friend_requests_recipient_idx").on(t.recipientMemberId, t.status)]);

export const friendshipsTable = pgTable("friendships", {
  id: text("id").primaryKey(),
  memberAId: text("member_a_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  memberBId: text("member_b_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("friendships_pair_unique").on(t.memberAId, t.memberBId), check("friendships_canonical_pair", sql`${t.memberAId} < ${t.memberBId}`), index("friendships_a_idx").on(t.memberAId), index("friendships_b_idx").on(t.memberBId)]);

export const followsTable = pgTable("follows", {
  id: text("id").primaryKey(),
  followerMemberId: text("follower_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  followedMemberId: text("followed_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("follows_unique").on(t.followerMemberId, t.followedMemberId), index("follows_follower_idx").on(t.followerMemberId), index("follows_followed_idx").on(t.followedMemberId)]);

export const discoverySettingsTable = pgTable("discovery_settings", {
  memberId: text("member_id").primaryKey().references(() => membersTable.id, { onDelete: "cascade" }),
  inboundFriendRequests: boolean("inbound_friend_requests").notNull().default(true),
  inboundFollows: boolean("inbound_follows").notNull().default(true),
  suggestionsEnabled: boolean("suggestions_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const suggestionHidesTable = pgTable("suggestion_hides", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  suggestedMemberId: text("suggested_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("suggestion_hides_unique").on(t.memberId, t.suggestedMemberId)]);

export type FriendRequest = typeof friendRequestsTable.$inferSelect;
export type Friendship = typeof friendshipsTable.$inferSelect;
export type Follow = typeof followsTable.$inferSelect;