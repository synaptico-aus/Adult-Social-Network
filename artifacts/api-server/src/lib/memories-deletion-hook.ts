import { eq } from "drizzle-orm";
import { db, memoryCollectionsTable, memoryReminderPreferencesTable, hiddenMemoriesTable } from "@workspace/db";
import { registerDeletionHook } from "./deletion-hooks";

registerDeletionHook({
  name: "phase-14-memory-collections",
  async run({ memberId }) {
    // Cascades remove item references only. Never delete someone else's source.
    await db.delete(memoryCollectionsTable).where(eq(memoryCollectionsTable.ownerMemberId, memberId));
    await db.delete(memoryReminderPreferencesTable).where(eq(memoryReminderPreferencesTable.memberId, memberId));
    await db.delete(hiddenMemoriesTable).where(eq(hiddenMemoriesTable.memberId, memberId));
  },
});
