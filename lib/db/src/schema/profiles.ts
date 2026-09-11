import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

export const profileVisibility = ["private", "connections", "members"] as const;
export const cardKinds = ["things_i_enjoy", "music_i_love", "experiences_i_want_to_share", "how_i_like_to_communicate"] as const;
export const verificationStatuses = ["pending", "approved", "rejected", "withdrawn"] as const;

export const profilesTable = pgTable("profiles", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }).unique(),
  preferredName: text("preferred_name").notNull(),
  photoPath: text("photo_path"),
  photoMimeType: text("photo_mime_type"),
  photoSize: integer("photo_size"),
  biography: text("biography"),
  language: text("language"),
  broadRegion: text("broad_region"),
  interests: jsonb("interests").$type<string[]>().notNull().default([]),
  dementiaConnection: text("dementia_connection"),
  roles: jsonb("roles").$type<string[]>().notNull().default([]),
  discoverable: boolean("discoverable").notNull().default(false),
  visibility: jsonb("visibility").$type<Record<string, typeof profileVisibility[number]>>().notNull().default({
    preferredName: "members", photoPath: "private", biography: "private", language: "private",
    broadRegion: "private", interests: "private", dementiaConnection: "private", roles: "private",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("profiles_discoverable_idx").on(table.discoverable),
  check("profiles_preferred_name_nonempty", sql`length(trim(${table.preferredName})) > 0`),
]);

export const thisIsMeCardsTable = pgTable("this_is_me_cards", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: cardKinds }).notNull(),
  text: text("text").notNull(),
  position: integer("position").notNull().default(0),
  permissionAcknowledged: boolean("permission_acknowledged").notNull().default(false),
  mediaAssetIds: jsonb("media_asset_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("this_is_me_cards_member_idx").on(table.memberId),
  uniqueIndex("this_is_me_cards_kind_idx").on(table.memberId, table.kind),
  uniqueIndex("this_is_me_cards_order_idx").on(table.memberId, table.position),
]);

export const verificationRequestsTable = pgTable("verification_requests", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  evidence: text("evidence"),
  notes: text("notes"),
  status: text("status", { enum: verificationStatuses }).notNull().default("pending"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("verification_member_idx").on(table.memberId)]);

export const consentHistoryTable = pgTable("consent_history", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "restrict" }),
  purpose: text("purpose").notNull(),
  version: text("version").notNull(),
  granted: boolean("granted").notNull(),
  scope: jsonb("scope").$type<string[]>().notNull().default([]),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("consent_history_member_idx").on(table.memberId, table.recordedAt)]);

export const insertProfileSchema = createInsertSchema(profilesTable).omit({ createdAt: true, updatedAt: true });
export type Profile = typeof profilesTable.$inferSelect;
export type ThisIsMeCard = typeof thisIsMeCardsTable.$inferSelect;
export type VerificationRequest = typeof verificationRequestsTable.$inferSelect;
export type ConsentHistory = typeof consentHistoryTable.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;