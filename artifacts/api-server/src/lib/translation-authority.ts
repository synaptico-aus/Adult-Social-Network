import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, membersTable, postsTable, translationsTable, educationLessonsTable, educationRevisionsTable } from "@workspace/db";
import { visiblePost } from "../routes/posts";
import { publicLesson } from "../routes/education";
import { enabledLocale } from "./experience-catalogue";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export async function translationSource(type: string, id: string, viewer: string) {
  if (type === "post") {
    const [post] = await db.select().from(postsTable).where(eq(postsTable.id, id));
    if (!post || post.status !== "published" || !(await visiblePost(post, viewer))) return null;
    return { hash: hash(JSON.stringify([post.body, post.commentary])), revisionId: null };
  }
  const [lesson] = await db.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, id));
  if (!lesson || lesson.withdrawnAt || lesson.status === "archived" || !lesson.publishedRevisionId) return null;
  const live = await publicLesson(lesson);
  if (!live || live.reviewDue) return null;
  const [revision] = await db.select().from(educationRevisionsTable).where(eq(educationRevisionsTable.id, lesson.publishedRevisionId));
  if (!revision || revision.status !== "published") return null;
  return { hash: hash(JSON.stringify([revision.id, revision.title, revision.summary, revision.body])), revisionId: revision.id };
}
export async function currentTranslation(row: typeof translationsTable.$inferSelect, viewer: string) {
  if (!enabledLocale(row.locale)) return false;
  const original = await translationSource(row.sourceType, row.sourceId, viewer);
  if (!original || original.hash !== row.sourceHash || original.revisionId !== row.sourceRevisionId || !row.authorMemberId) return false;
  const [author] = await db.select().from(membersTable).where(and(eq(membersTable.id, row.authorMemberId), eq(membersTable.active, true)));
  return Boolean(author && await translationSource(row.sourceType, row.sourceId, author.id));
}
