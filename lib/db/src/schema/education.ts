import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const educationLifecycleStates = ["draft", "review", "published", "review_due", "archived"] as const;
export const educationRevisionStates = ["draft", "review", "published", "rejected"] as const;
export const educationSourceKinds = ["historical", "historical_population_research", "current_evidence", "guidance", "service", "licensed_link"] as const;
export const educationRightsStatuses = ["original", "permitted", "link_only"] as const;
export const educationCorrectionKinds = ["correction", "withdrawal"] as const;

export const educationCategorySlugs = [
  "understanding",
  "communication",
  "support",
  "safety",
  "resources",
] as const;

export const educationCategoriesTable = pgTable("education_categories", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("education_categories_slug_unique").on(t.slug)]);

export const educationLessonsTable = pgTable("education_lessons", {
  id: text("id").primaryKey(),
  categoryId: text("category_id").notNull().references(() => educationCategoriesTable.id),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  seedOrigin: text("seed_origin").notNull().default("staff"),
  status: text("status", { enum: educationLifecycleStates }).notNull().default("draft"),
  authorClerkUserId: text("author_clerk_user_id").notNull(),
  currentRevisionId: text("current_revision_id"),
  publishedRevisionId: text("published_revision_id"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  reviewDueAt: timestamp("review_due_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("education_lessons_slug_unique").on(t.slug), index("education_lessons_status_idx").on(t.status, t.updatedAt)]);

export const educationRevisionsTable = pgTable("education_revisions", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id").notNull().references(() => educationLessonsTable.id),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  body: text("body").notNull(),
  region: text("region").notNull(),
  educationalWording: text("educational_wording").notNull(),
  avoidsBlameAndGuarantees: boolean("avoids_blame_and_guarantees").notNull().default(false),
  avoidsBlameAttestation: boolean("avoids_blame_attestation").notNull().default(false),
  avoidsIndividualGuaranteesAttestation: boolean("avoids_individual_guarantees_attestation").notNull().default(false),
  restrictedContentLinkedOnly: boolean("restricted_content_linked_only").notNull().default(false),
  contentRightsConfirmed: boolean("content_rights_confirmed").notNull().default(false),
  containsCopiedRestrictedContent: boolean("contains_copied_restricted_content").notNull().default(false),
  status: text("status", { enum: educationRevisionStates }).notNull().default("draft"),
  authorClerkUserId: text("author_clerk_user_id").notNull(),
  reviewerClerkUserId: text("reviewer_clerk_user_id"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  accessibleMedia: jsonb("accessible_media"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("education_revisions_lesson_version_unique").on(t.lessonId, t.version), index("education_revisions_lesson_idx").on(t.lessonId, t.createdAt)]);

export const educationSourcesTable = pgTable("education_sources", {
  id: text("id").primaryKey(),
  revisionId: text("revision_id").notNull().references(() => educationRevisionsTable.id),
  kind: text("kind", { enum: educationSourceKinds }).notNull(),
  citation: text("citation").notNull(),
  url: text("url"),
  provenance: text("provenance").notNull(),
  sourceDate: timestamp("source_date", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  evidenceCheckedAt: timestamp("evidence_checked_at", { withTimezone: true }),
  region: text("region").notNull(),
  rightsStatus: text("rights_status", { enum: educationRightsStatuses }).notNull().default("permitted"),
  rightsPermissions: text("rights_permissions").notNull(),
  currentEvidenceSourceId: text("current_evidence_source_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("education_sources_revision_idx").on(t.revisionId)]);

export const educationCorrectionsTable = pgTable("education_corrections", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id").notNull().references(() => educationLessonsTable.id),
  revisionId: text("revision_id").references(() => educationRevisionsTable.id),
  kind: text("kind", { enum: educationCorrectionKinds }).notNull(),
  reason: text("reason").notNull(),
  replacementRevisionId: text("replacement_revision_id").references(() => educationRevisionsTable.id),
  actorClerkUserId: text("actor_clerk_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("education_corrections_lesson_idx").on(t.lessonId, t.createdAt)]);

export const educationSavesTable = pgTable("education_saves", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  lessonId: text("lesson_id").notNull().references(() => educationLessonsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("education_saves_member_lesson_unique").on(t.memberId, t.lessonId)]);

export const educationProgressTable = pgTable("education_progress", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  lessonId: text("lesson_id").notNull().references(() => educationLessonsTable.id, { onDelete: "cascade" }),
  revisionId: text("revision_id").references(() => educationRevisionsTable.id),
  percent: integer("percent"),
  position: text("position"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completionOptIn: boolean("completion_opt_in").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("education_progress_member_lesson_unique").on(t.memberId, t.lessonId)]);

export type EducationCategory = typeof educationCategoriesTable.$inferSelect;
export type EducationLesson = typeof educationLessonsTable.$inferSelect;
export type EducationRevision = typeof educationRevisionsTable.$inferSelect;
export type EducationSource = typeof educationSourcesTable.$inferSelect;
export type EducationCorrection = typeof educationCorrectionsTable.$inferSelect;