import { registerDeletionHook } from "./deletion-hooks";
import { db, appealsTable, reportsTable, safetyRelationshipsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/** Phase 4 deletion: remove member controls and scrub retained safety text. Retention approval remains pending. */
registerDeletionHook({
  name: "phase-4-safety-and-moderation",
  async run({ memberId }) {
    await db.transaction(async (tx) => {
      await tx.delete(safetyRelationshipsTable).where(eq(safetyRelationshipsTable.actorMemberId, memberId));
      await tx.update(reportsTable).set({ reporterMemberId: null, details: null }).where(eq(reportsTable.reporterMemberId, memberId));
      await tx.update(appealsTable).set({ appellantMemberId: null, statement: "[redacted]" }).where(eq(appealsTable.appellantMemberId, memberId));
    });
  },
});