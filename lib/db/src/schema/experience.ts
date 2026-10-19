import { pgTable, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const experiencePreferencesTable = pgTable("experience_preferences", {
  memberId: text("member_id").primaryKey().references(() => membersTable.id, { onDelete: "cascade" }),
  locale: text("locale").notNull().default("en-AU"),
  timeZone: text("time_zone").notNull().default("Australia/Sydney"),
  direction: text("direction", { enum: ["auto", "ltr", "rtl"] }).notNull().default("auto"),
  lowData: boolean("low_data").notNull().default(true),
  textFirst: boolean("text_first").notNull().default(true),
  offlineDrafts: boolean("offline_drafts").notNull().default(false),
  country: text("country").notNull().default("AU"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const experienceDraftsTable = pgTable("experience_drafts", {
  memberId: text("member_id").primaryKey().references(() => membersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  audience: text("audience", { enum: ["only_me", "friends", "my_circle", "this_group", "public"] }).notNull().default("only_me"),
  circleId: text("circle_id"),
  groupId: text("group_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const translationsTable = pgTable("content_translations", {
  id: text("id").primaryKey(),
  sourceType: text("source_type", { enum: ["post", "lesson"] }).notNull(),
  sourceId: text("source_id").notNull(),
  sourceHash: text("source_hash").notNull(),
  sourceRevisionId: text("source_revision_id"),
  locale: text("locale").notNull(),
  text: text("text").notNull(),
  machineTranslated: boolean("machine_translated").notNull().default(false),
  authorMemberId: text("author_member_id").references(() => membersTable.id, { onDelete: "set null" }),
  authorClerkId: text("author_clerk_id").notNull(),
  correctionOf: text("correction_of"),
  status: text("status", { enum: ["pending", "reviewed", "published", "removed"] }).notNull().default("pending"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  publishedBy: text("published_by"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const translationReportsTable = pgTable("translation_reports", {
  id: text("id").primaryKey(),
  translationId: text("translation_id").notNull().references(() => translationsTable.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("translation_report_member_idx").on(t.translationId, t.memberId)]);
