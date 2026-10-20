import { registerDeletionHook } from "./deletion-hooks";
import { db, profilesTable, thisIsMeCardsTable, verificationRequestsTable, mediaCleanupTasksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { deleteProfilePhoto } from "./profile-photo-storage";
import { purgeFriendPrivacyReferences } from "./friend-privacy-cleanup";

/**
 * Profile records are account-owned and cascade from members. The hook is
 * explicit so future retention workers can preserve compliance facts while
 * removing profile content rather than silently erasing audit history.
 */
registerDeletionHook({
  name: "profile-and-consent-data",
  async run({ memberId }) {
    // Purge the deleted person's identifiers from other members' saved choices.
    await purgeFriendPrivacyReferences(memberId);
    const profile = (await db.select().from(profilesTable).where(eq(profilesTable.memberId, memberId)).limit(1))[0];
    if (profile?.photoPath) {
      await db.insert(mediaCleanupTasksTable).values({ assetId: `profile:${memberId}`, paths: [profile.photoPath], nextAttemptAt: new Date(Date.now() + 60000), expiresAt: new Date(Date.now() + 86400000) }).onConflictDoNothing();
      await deleteProfilePhoto(profile.photoPath);
    }
    await db.delete(thisIsMeCardsTable).where(eq(thisIsMeCardsTable.memberId, memberId));
    await db.delete(profilesTable).where(eq(profilesTable.memberId, memberId));
    await db.update(verificationRequestsTable)
      .set({ evidence: null, notes: null })
      .where(eq(verificationRequestsTable.memberId, memberId));
    // Minimal verification outcomes and consent history remain for compliance
    // review. The future deletion worker must pseudonymise their member link
    // before deleting the member row.
  },
});