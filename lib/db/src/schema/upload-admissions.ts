import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Deliberately no account FK: cleanup and accounting must survive account deletion.
export const uploadAdmissionsTable = pgTable("upload_admissions", {
  id: text("id").primaryKey(),
  ownerMemberId: text("owner_member_id").notNull(),
  resourceId: text("resource_id").notNull(),
  purpose: text("purpose", { enum: ["media", "profile"] }).notNull(),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  state: text("state", { enum: ["reserved", "receiving", "stored", "cleanup", "released"] }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("upload_admission_owner_idx").on(t.ownerMemberId), index("upload_admission_expiry_idx").on(t.expiresAt)]);
