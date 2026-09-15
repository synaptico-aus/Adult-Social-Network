import { and, eq } from "drizzle-orm";
import { db, educationProgressTable, educationSavesTable } from "@workspace/db";
import { registerDeletionHook } from "./deletion-hooks";

// Education authoring is staff-owned and retained for audit. A member's
// private learning state is account-owned and is removed with that account.
registerDeletionHook({
  name: "education-private-learning",
  run: async ({ memberId }) => {
    await db.delete(educationProgressTable).where(eq(educationProgressTable.memberId, memberId));
    await db.delete(educationSavesTable).where(eq(educationSavesTable.memberId, memberId));
  },
});