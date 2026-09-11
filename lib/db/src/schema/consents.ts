import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const memberConsentsTable = pgTable("member_consents", {
  memberId: text("member_id").notNull(),
  document: text("document").notNull(),
  version: text("version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.memberId, table.document] })]);

export const insertMemberConsentSchema = createInsertSchema(memberConsentsTable);
export type InsertMemberConsent = z.infer<typeof insertMemberConsentSchema>;
export type MemberConsent = typeof memberConsentsTable.$inferSelect;