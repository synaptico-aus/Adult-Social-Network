import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { membersTable } from "./members";
import { circlesTable } from "./circles";
import { groupsTable } from "./groups";
import { postAudiences } from "./posts";

export const memoryCollectionsTable = pgTable("memory_collections", {
  id: text("id").primaryKey(),
  ownerMemberId: text("owner_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sharingHeld: boolean("sharing_held").notNull().default(true),
  revision: integer("revision").notNull().default(0),
  audience: text("audience", { enum: postAudiences }).notNull().default("only_me"),
  circleId: text("circle_id").references(() => circlesTable.id, { onDelete: "set null" }),
  groupId: text("group_id").references(() => groupsTable.id, { onDelete: "set null" }),
  sharedAt: timestamp("shared_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("memory_collections_owner_idx").on(t.ownerMemberId)]);

// References, not snapshots: deletion and permission revocation must stay effective.
export const memoryItemsTable = pgTable("memory_items", {
  id: text("id").primaryKey(),
  collectionId: text("collection_id").notNull().references(() => memoryCollectionsTable.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["post", "photo", "audio", "music"] }).notNull(),
  sourceId: text("source_id").notNull(),
  sourcePostId: text("source_post_id"),
  caption: text("caption").notNull().default(""),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("memory_items_collection_order_idx").on(t.collectionId, t.position)]);

export const memoryReminderPreferencesTable = pgTable("memory_reminder_preferences", {
  memberId: text("member_id").primaryKey().references(() => membersTable.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  consentedAt: timestamp("consented_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hiddenMemoriesTable = pgTable("hidden_memories", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  sourceKey: text("source_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("hidden_memories_member_source_unique").on(t.memberId, t.sourceKey)]);

export const insertMemoryCollectionSchema = createInsertSchema(memoryCollectionsTable);
export const insertMemoryItemSchema = createInsertSchema(memoryItemsTable);
export type MemoryCollection = typeof memoryCollectionsTable.$inferSelect;
export type MemoryItem = typeof memoryItemsTable.$inferSelect;
