import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

export const mediaKinds = ["photo", "audio"] as const;
export const mediaStatuses = ["uploading", "quarantined", "held", "ready", "rejected", "cancelled", "cleanup_pending"] as const;
export const scanStates = ["pending", "allowed", "blocked", "unavailable", "error"] as const;

export const mediaAssetsTable = pgTable("media_assets", {
  id: text("id").primaryKey(),
  ownerMemberId: text("owner_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: mediaKinds }).notNull(),
  objectPath: text("object_path").notNull().unique(),
  clientIdempotencyKey: text("client_idempotency_key").notNull(),
  requestedContentType: text("requested_content_type").notNull(),
  contentType: text("content_type"),
  byteSize: integer("byte_size"),
  width: integer("width"),
  height: integer("height"),
  durationSeconds: integer("duration_seconds"),
  status: text("status", { enum: mediaStatuses }).notNull().default("uploading"),
  malwareState: text("malware_state", { enum: scanStates }).notNull().default("pending"),
  abuseState: text("abuse_state", { enum: scanStates }).notNull().default("pending"),
  transcript: text("transcript"),
  altText: text("alt_text"),
  rejectionReason: text("rejection_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("media_owner_idempotency_unique").on(t.ownerMemberId, t.clientIdempotencyKey),
  index("media_owner_status_idx").on(t.ownerMemberId, t.status),
  index("media_expiry_idx").on(t.expiresAt),
]);

export const mediaScreeningResultsTable = pgTable("media_screening_results", {
  id: text("id").primaryKey(),
  assetId: text("asset_id").notNull().references(() => mediaAssetsTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  state: text("state", { enum: scanStates }).notNull(),
  provider: text("provider").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("media_screening_asset_idx").on(t.assetId, t.createdAt)]);

export const insertMediaAssetSchema = createInsertSchema(mediaAssetsTable);
export type MediaAsset = typeof mediaAssetsTable.$inferSelect;
export type InsertMediaAsset = z.infer<typeof insertMediaAssetSchema>;