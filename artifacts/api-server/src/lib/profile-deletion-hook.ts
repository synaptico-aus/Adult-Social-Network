import { registerDeletionHook } from "./deletion-hooks";
import { db, profilesTable, thisIsMeCardsTable, verificationRequestsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { deleteProfilePhoto } from "./profile-photo-storage";

/**
 * Profile records are account-owned and cascade from members. The hook is
 * explicit so future retention workers can preserve compliance facts while
 * removing profile content rather than silently erasing audit history.
 */
registerDeletionHook({
  name: "profile-and-consent-data",
  async run({ memberId }) {
    const profile = (await db.select().from(profilesTable).where(eq(profilesTable.memberId, memberId)).limit(1))[0];
    if (profile?.photoPath) await deleteProfilePhoto(profile.photoPath);
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