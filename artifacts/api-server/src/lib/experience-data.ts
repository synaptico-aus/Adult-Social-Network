import { and, eq } from "drizzle-orm";
import { db, experiencePreferencesTable, experienceDraftsTable, translationsTable, translationReportsTable } from "@workspace/db";
import { registerDeletionHook } from "./deletion-hooks";
import { currentTranslation } from "./translation-authority";

export async function exportExperience(memberId: string) {
  const [preferences] = await db.select().from(experiencePreferencesTable).where(eq(experiencePreferencesTable.memberId, memberId));
  const [draft] = await db.select().from(experienceDraftsTable).where(eq(experienceDraftsTable.memberId, memberId));
  // Export the member's own submissions, never other authors' private originals.
  const translations = await db.select().from(translationsTable).where(and(eq(translationsTable.authorMemberId, memberId)));
  const reports = await db.select().from(translationReportsTable).where(eq(translationReportsTable.memberId, memberId));
  const permittedTranslations = await Promise.all(translations.map(async row =>
    row.status !== "removed" && await currentTranslation(row, memberId)
      ? row : { id: row.id, unavailable: true }));
  return { preferences: preferences ?? null, draft: draft ?? null, translations: permittedTranslations, reports };
}
registerDeletionHook({
  name: "experience-localisation-and-drafts",
  async run({ memberId }) {
    await db.delete(translationReportsTable).where(eq(translationReportsTable.memberId, memberId));
    await db.delete(translationsTable).where(eq(translationsTable.authorMemberId, memberId));
    await db.delete(experienceDraftsTable).where(eq(experienceDraftsTable.memberId, memberId));
    await db.delete(experiencePreferencesTable).where(eq(experiencePreferencesTable.memberId, memberId));
  },
});
