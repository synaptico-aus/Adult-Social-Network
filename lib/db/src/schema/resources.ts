import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const resourcesTable = pgTable("external_resources", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  domain: text("domain").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  region: text("region").notNull(),
  sourceDate: timestamp("source_date", { withTimezone: true }),
  preview: text("preview").notNull().default(""),
  previewPermission: text("preview_permission").notNull().default(""),
  embedAuthorized: boolean("embed_authorized").notNull().default(false),
  status: text("status", { enum: ["draft", "reviewed", "removed"] }).notNull().default("draft"),
  editorId: text("editor_id").notNull(),
  reviewerId: text("reviewer_id"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  linkState: text("link_state", { enum: ["unchecked", "reachable", "unavailable", "redirected"] }).notNull().default("unchecked"),
  removalReason: text("removal_reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const resourceReportsTable = pgTable("external_resource_reports", {
  id: text("id").primaryKey(),
  resourceId: text("resource_id").notNull().references(() => resourcesTable.id),
  memberId: text("member_id").references(() => membersTable.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
  resolution: text("resolution"),
  resolvedBy: text("resolved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("external_resource_reports_queue").on(t.status, t.createdAt)]);

// Retain staff decisions separately from the mutable current catalog entry.
export const resourceEventsTable = pgTable("external_resource_events", {
  id: text("id").primaryKey(),
  resourceId: text("resource_id").notNull().references(() => resourcesTable.id),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
