import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { membersTable } from "./members";

/** Operational notes are restricted records, never analytics event payloads. */
export const operationsRecordsTable = pgTable("operations_records", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), targetId: text("target_id"),
  title: text("title").notNull(), note: text("note").notNull(), status: text("status").notNull(),
  reference: text("reference"), region: text("region"), numericValue: doublePrecision("numeric_value"),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  actorClerkUserId: text("actor_clerk_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("ops_records_kind_time").on(t.kind, t.createdAt)]);
export const featureControlsTable = pgTable("feature_controls", {
  key: text("key").primaryKey(), enabled: boolean("enabled").notNull(),
  reason: text("reason").notNull(), updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const announcementsTable = pgTable("announcements", {
  id: text("id").primaryKey(), title: text("title").notNull(), body: text("body").notNull(),
  region: text("region").notNull().default("AU"), status: text("status").notNull().default("draft"),
  authorClerkUserId: text("author_clerk_user_id").notNull(), publishedBy: text("published_by"),
  sponsorshipDisclosure: text("sponsorship_disclosure"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const dutySessionsTable = pgTable("staff_duty_sessions", {
  id: text("id").primaryKey(), actorClerkUserId: text("actor_clerk_user_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
  observedSeconds: integer("observed_seconds").notNull().default(0), endedAt: timestamp("ended_at", { withTimezone: true }),
});
export const serviceMeasurementsTable = pgTable("service_measurements", {
  id: text("id").primaryKey(), memberId: text("member_id").references(() => membersTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), task: text("task"), value: doublePrecision("value").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("service_measurement_kind_time").on(t.kind, t.occurredAt)]);
export const humanResponsesTable = pgTable("human_responses", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), subjectId: text("subject_id").notNull(),
  actorMemberId: text("actor_member_id").references(() => membersTable.id, { onDelete: "set null" }),
  actorClerkUserId: text("actor_clerk_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("human_response_subject_once").on(t.kind, t.subjectId)]);
export const deletionStepsTable = pgTable("deletion_steps", {
  id: text("id").primaryKey(), requestId: text("request_id").notNull(), memberId: text("member_id").notNull(),
  module: text("module").notNull(), status: text("status").notNull(), errorCode: text("error_code"),
  attempts: integer("attempts").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("deletion_step_request_module").on(t.requestId, t.module)]);
export const operationalCountersTable = pgTable("operational_counters", {
  key: text("key").primaryKey(), count: doublePrecision("count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
