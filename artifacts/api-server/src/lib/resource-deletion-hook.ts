import { db, resourceReportsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { registerDeletionHook } from "./deletion-hooks";

registerDeletionHook({
  name: "external-resource-reports",
  run: async ({ memberId }) => {
    // Keep safety decisions, detach the reporting member's identity.
    await db.update(resourceReportsTable).set({ memberId: null }).where(eq(resourceReportsTable.memberId, memberId));
  },
});
