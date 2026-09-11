import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { membersTable } from "./members";
import { circlesTable } from "./circles";

export const postAudiences = ["only_me", "friends", "my_circle", "public"] as const;
export const responseLabels = ["someone_to_listen", "shared_experiences", "practical_ideas", "something_uplifting"] as const;
export const postStatuses = ["draft", "published", "deleted"] as const;
export const commentStatuses = ["active", "deleted"] as const;
export const reactionKinds = ["hear_you", "thank_you_for_sharing"] as const;

export const postsTable = pgTable("posts", {
  id: text("id").primaryKey(),
  authorMemberId: text("author_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  audience: text("audience", { enum: postAudiences }).notNull().default("only_me"),
  circleId: text("circle_id").references(() => circlesTable.id, { onDelete: "set null" }),
  responseLabel: text("response_label", { enum: responseLabels }),
  commentsOpen: boolean("comments_open").notNull().default(true),
  visibleReactionCounts: boolean("visible_reaction_counts").notNull().default(true),
  status: text("status", { enum: postStatuses }).notNull().default("draft"),
  originalPostId: text("original_post_id"),
  commentary: text("commentary"),
  mediaAssetIds: jsonb("media_asset_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  index("posts_author_created_idx").on(t.authorMemberId, t.createdAt, t.id),
  index("posts_feed_created_idx").on(t.status, t.createdAt, t.id),
   index("posts_circle_created_idx").on(t.circleId, t.status, t.createdAt, t.id),
]);

export const commentsTable = pgTable("post_comments", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  authorMemberId: text("author_member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  parentCommentId: text("parent_comment_id"),
  body: text("body").notNull(),
  status: text("status", { enum: commentStatuses }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [index("post_comments_post_created_idx").on(t.postId, t.createdAt), index("post_comments_parent_idx").on(t.parentCommentId)]);

export const postReactionsTable = pgTable("post_reactions", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: reactionKinds }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("post_reactions_member_kind_unique").on(t.postId, t.memberId, t.kind), index("post_reactions_post_idx").on(t.postId)]);

export const postSavesTable = pgTable("post_saves", {
  id: text("id").primaryKey(), postId: text("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("post_saves_member_post_unique").on(t.memberId, t.postId)]);

export const postHidesTable = pgTable("post_hides", {
  id: text("id").primaryKey(), postId: text("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("post_hides_member_post_unique").on(t.memberId, t.postId)]);

export type Post = typeof postsTable.$inferSelect;
export type PostComment = typeof commentsTable.$inferSelect;