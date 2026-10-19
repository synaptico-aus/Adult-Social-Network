import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** A request remains pending until an approved deletion worker/process handles hooks. */
export const deletionRequestsTable = pgTable("deletion_requests", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  status: text("status").notNull().default("pending"),
  reauthMethod: text("reauth_method").notNull(),
  reauthenticatedAt: timestamp("reauthenticated_at", { withTimezone: true }).notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  lastError: text("last_error"),
});

export const insertDeletionRequestSchema = createInsertSchema(deletionRequestsTable);
export type InsertDeletionRequest = z.infer<typeof insertDeletionRequestSchema>;
export type DeletionRequest = typeof deletionRequestsTable.$inferSelect;