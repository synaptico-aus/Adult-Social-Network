import { registerDeletionHook } from "./deletion-hooks";
import { db, profilesTable, thisIsMeCardsTable, verificationRequestsTable, mediaCleanupTasksTable, uploadAdmissionsTable } from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";
import { deleteProfilePhoto } from "./profile-photo-storage";
import { purgeFriendPrivacyReferences } from "./friend-privacy-cleanup";
import { retireUpload } from "./upload-admission";
import { deleteIngestedObject } from "./media-storage";

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
    // Unattached and interrupted photos belong to the account too.
    const uploads = await db.select().from(uploadAdmissionsTable).where(and(eq(uploadAdmissionsTable.ownerMemberId, memberId), eq(uploadAdmissionsTable.purpose, "profile"), ne(uploadAdmissionsTable.state, "released")));
    for (const upload of uploads) await retireUpload(upload.resourceId, () => deleteIngestedObject(upload.objectPath));
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
