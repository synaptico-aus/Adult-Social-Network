import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, type MediaAsset, postsTable, messagesTable, conversationsTable, conversationMembersTable, messageMemberRemovalsTable, safetyRelationshipsTable } from "@workspace/db";
import { visiblePost } from "../routes/posts";
import { liveConversationMember } from "./conversation-access";

/** Every original/derivative/thumbnail/caption/transcript request uses live authority. */
export async function canReadMedia(asset: MediaAsset, viewer: string) {
  const owns = asset.ownerMemberId === viewer;
  const posts = await db.select().from(postsTable).where(and(
    sql`${postsTable.mediaAssetIds} @> ${JSON.stringify([asset.id])}::jsonb`, eq(postsTable.status, "published")));
  const visibleAttachment = !owns && (await Promise.all(posts.map((post) => visiblePost(post, viewer)))).some(Boolean);
  const ownScoped = posts.filter((post) => ["this_group", "my_circle"].includes(post.audience) && post.authorMemberId === viewer);
  const ownScopedVisible = owns && (await Promise.all(ownScoped.map((post) => visiblePost(post, viewer)))).every(Boolean);
  const messageRows = await db.select().from(messagesTable).where(sql`${messagesTable.mediaAssetIds} @> ${JSON.stringify([asset.id])}::jsonb`);
  let visibleMessage = false;
  for (const message of messageRows) {
    if (message.deletedForEveryoneAt) continue;
    const conversation = (await db.select().from(conversationsTable).where(and(eq(conversationsTable.id, message.conversationId), eq(conversationsTable.status, "active"))).limit(1))[0];
    const membership = conversation && await liveConversationMember(message.conversationId, viewer);
    const removed = membership && (await db.select().from(messageMemberRemovalsTable).where(and(eq(messageMemberRemovalsTable.messageId, message.id), eq(messageMemberRemovalsTable.memberId, viewer))).limit(1))[0];
    const participants = conversation && await db.select({ memberId: conversationMembersTable.memberId }).from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, message.conversationId), eq(conversationMembersTable.status, "active")));
    const blocked = participants?.length ? (await db.select().from(safetyRelationshipsTable).where(and(eq(safetyRelationshipsTable.kind, "block"),
      or(and(eq(safetyRelationshipsTable.actorMemberId, viewer), inArray(safetyRelationshipsTable.targetMemberId, participants.map((p) => p.memberId))),
        and(eq(safetyRelationshipsTable.targetMemberId, viewer), inArray(safetyRelationshipsTable.actorMemberId, participants.map((p) => p.memberId)))))).limit(1))[0] : undefined;
    if (membership && message.createdAt >= membership.joinedAt && !removed && !blocked) { visibleMessage = true; break; }
  }
  if (messageRows.length && !visibleMessage) return false;
  if ((!owns || ownScoped.length > 0) && !visibleAttachment && !ownScopedVisible && !visibleMessage) return false;
  return true;
}
