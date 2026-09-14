import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Local authorization state bridged from the managed Clerk identity. */
export const membersTable = pgTable("members", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  ageEligible: boolean("age_eligible"),
  ageEligibilityMethod: text("age_eligibility_method"),
  agePolicyVersion: text("age_policy_version"),
  ageCheckedAt: timestamp("age_checked_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMemberSchema = createInsertSchema(membersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof membersTable.$inferSelect;