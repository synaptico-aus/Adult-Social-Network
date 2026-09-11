import { and, eq, or } from "drizzle-orm";
import { db, commentsTable, notificationEventsTable, postHidesTable, postReactionsTable, postSavesTable, postsTable } from "@workspace/db";
import { registerDeletionHook } from "./deletion-hooks";
registerDeletionHook({
  name: "phase-6-posts-and-interactions",
  async run({ memberId }) {
    await db.transaction(async (tx) => {
      await tx.update(postsTable).set({ status: "deleted", body: "", deletedAt: new Date() }).where(eq(postsTable.authorMemberId, memberId));
      await tx.update(commentsTable).set({ status: "deleted", body: "", deletedAt: new Date() }).where(eq(commentsTable.authorMemberId, memberId));
      await tx.delete(postReactionsTable).where(eq(postReactionsTable.memberId, memberId));
      await tx.delete(postSavesTable).where(eq(postSavesTable.memberId, memberId));
      await tx.delete(postHidesTable).where(eq(postHidesTable.memberId, memberId));
      await tx.delete(notificationEventsTable).where(or(eq(notificationEventsTable.actorMemberId, memberId), eq(notificationEventsTable.recipientMemberId, memberId)));
    });
  },
});