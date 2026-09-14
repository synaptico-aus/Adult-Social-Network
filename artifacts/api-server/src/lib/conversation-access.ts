import { and, eq } from "drizzle-orm";
import {
  conversationMembersTable,
  conversationsTable,
  groupMembersTable,
  groupsTable,
  db,
} from "@workspace/db";

/**
 * The sole live authorization check for conversation membership. A conversation
 * linked to a group is only live while both the conversation membership and
 * the linked group membership are active.
 */
export async function liveConversationMember(
  conversationId: string,
  memberId: string,
  source: any = db,
) {
  const membership = (await source
    .select()
    .from(conversationMembersTable)
    .where(and(
      eq(conversationMembersTable.conversationId, conversationId),
      eq(conversationMembersTable.memberId, memberId),
      eq(conversationMembersTable.status, "active"),
    ))
    .limit(1))[0];
  if (!membership) return undefined;
  const conversation = (await source
    .select({ id: conversationsTable.id, kind: conversationsTable.kind, groupId: conversationsTable.groupId, status: conversationsTable.status })
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1))[0];
  if (!conversation || conversation.status !== "active") return undefined;
  if (conversation.kind === "group" && conversation.groupId) {
    const group = (await source
      .select({ id: groupsTable.id })
      .from(groupsTable)
      .where(and(eq(groupsTable.id, conversation.groupId), eq(groupsTable.status, "active")))
      .limit(1))[0];
    const groupMembership = (await source
      .select({ id: groupMembersTable.id, joinedAt: groupMembersTable.joinedAt })
      .from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.groupId, conversation.groupId),
        eq(groupMembersTable.memberId, memberId),
        eq(groupMembersTable.status, "active"),
      ))
      .limit(1))[0];
    if (!group || !groupMembership) return undefined;
    if (groupMembership.joinedAt > membership.joinedAt) {
      return { ...membership, joinedAt: groupMembership.joinedAt };
    }
  }
  return membership;
}