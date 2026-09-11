import { eq, or } from "drizzle-orm";
import { registerDeletionHook } from "./deletion-hooks";
import { db, friendRequestsTable, friendshipsTable, followsTable, discoverySettingsTable, suggestionHidesTable } from "@workspace/db";

registerDeletionHook({
  name: "phase-5-relationships-and-discovery",
  async run({ memberId }) {
    await db.transaction(async (tx) => {
      await tx.delete(friendRequestsTable).where(or(eq(friendRequestsTable.requesterMemberId, memberId), eq(friendRequestsTable.recipientMemberId, memberId)));
      await tx.delete(friendshipsTable).where(or(eq(friendshipsTable.memberAId, memberId), eq(friendshipsTable.memberBId, memberId)));
      await tx.delete(followsTable).where(or(eq(followsTable.followerMemberId, memberId), eq(followsTable.followedMemberId, memberId)));
      await tx.delete(suggestionHidesTable).where(or(eq(suggestionHidesTable.memberId, memberId), eq(suggestionHidesTable.suggestedMemberId, memberId)));
      await tx.delete(discoverySettingsTable).where(eq(discoverySettingsTable.memberId, memberId));
    });
  },
});