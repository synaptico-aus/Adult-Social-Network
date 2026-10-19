import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, circlesTable, circleMembersTable, circleInvitationsTable, circleHistoryGrantsTable, conversationsTable, conversationMembersTable, messagesTable, messageRequestsTable, messageContactSettingsTable, messageMediaAttachmentsTable, groupsTable, groupWelcomeRequestsTable, communityHostTrainingTable, operationsRecordsTable, membersTable } from "@workspace/db";
import { registerDeletionHook } from "./deletion-hooks";

registerDeletionHook({
  name: "circles-and-private-messaging",
  async run({ memberId }) {
    await db.transaction(async tx => {
      await tx.update(circlesTable).set({ status: "closed", name: "Deleted member's circle", description: null }).where(eq(circlesTable.ownerMemberId, memberId));
      await tx.update(circleMembersTable).set({ status: "removed", removedAt: new Date() }).where(eq(circleMembersTable.memberId, memberId));
      await tx.delete(circleInvitationsTable).where(or(eq(circleInvitationsTable.recipientMemberId, memberId), eq(circleInvitationsTable.invitedByMemberId, memberId)));
      await tx.update(circleHistoryGrantsTable).set({ status: "revoked", revokedAt: new Date() }).where(eq(circleHistoryGrantsTable.memberId, memberId));
      const ownMessages = await tx.select({ id: messagesTable.id }).from(messagesTable).where(eq(messagesTable.senderMemberId, memberId));
      if (ownMessages.length) await tx.delete(messageMediaAttachmentsTable).where(inArray(messageMediaAttachmentsTable.messageId, ownMessages.map(m => m.id)));
      await tx.update(messagesTable).set({ body: null, mediaAssetIds: [], status: "deleted_for_everyone", deletedForEveryoneAt: new Date() }).where(eq(messagesTable.senderMemberId, memberId));
      await tx.delete(messageRequestsTable).where(or(eq(messageRequestsTable.senderMemberId, memberId), eq(messageRequestsTable.recipientMemberId, memberId)));
      await tx.delete(messageContactSettingsTable).where(eq(messageContactSettingsTable.memberId, memberId));
      await tx.update(conversationMembersTable).set({ status: "removed", removedAt: new Date(), leftAt: new Date() }).where(eq(conversationMembersTable.memberId, memberId));
      await tx.update(conversationsTable).set({ status: "closed", title: null, closedAt: new Date() }).where(or(eq(conversationsTable.createdByMemberId, memberId), eq(conversationsTable.memberAId, memberId), eq(conversationsTable.memberBId, memberId)));
      await tx.update(groupsTable).set({ status: "closed", closedAt: new Date(), name: "Closed group", description: null, rules: null }).where(eq(groupsTable.ownerMemberId, memberId));
      await tx.update(groupWelcomeRequestsTable).set({ introductionText: null }).where(eq(groupWelcomeRequestsTable.memberId, memberId));
      await tx.delete(communityHostTrainingTable).where(eq(communityHostTrainingTable.memberId, memberId));
      const [member] = await tx.select().from(membersTable).where(eq(membersTable.id, memberId));
      if (member) await tx.update(operationsRecordsTable).set({ title: "Deleted security report", note: "[member security-report details erased]" }).where(and(eq(operationsRecordsTable.actorClerkUserId, member.clerkUserId), eq(operationsRecordsTable.kind, "security")));
    });
  },
});
