import { and, eq } from "drizzle-orm";
import {
  db,
  groupMembersTable,
  groupsTable,
  postsTable,
} from "@workspace/db";

export type GroupQuerySource = {
  select: (...args: any[]) => any;
};

export async function activeGroupMembership(groupId: string, memberId: string, source: GroupQuerySource = db) {
  return (await source.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.groupId, groupId),
    eq(groupMembersTable.memberId, memberId),
    eq(groupMembersTable.status, "active"),
  )).limit(1))[0];
}

/**
 * A group is live for a viewer only while it is active and either public or
 * the viewer is an active member.  This is deliberately the single policy
 * used by group metadata and group-derived content.
 */
export async function canAccessGroup(groupId: string, viewerId: string, source: GroupQuerySource = db) {
  const group = (await source.select().from(groupsTable).where(and(
    eq(groupsTable.id, groupId),
    eq(groupsTable.status, "active"),
  )).limit(1))[0];
  if (!group) return false;
  if (group.discoverability === "private") return !!(await activeGroupMembership(groupId, viewerId, source));
  return true;
}

export async function canUseGroup(groupId: string | null | undefined, memberId: string, source: GroupQuerySource = db) {
  if (!groupId) return false;
  const group = (await source.select().from(groupsTable).where(and(
    eq(groupsTable.id, groupId),
    eq(groupsTable.status, "active"),
  )).limit(1))[0];
  return !!group && !!(await activeGroupMembership(groupId, memberId, source));
}

export async function canViewGroupPost(post: typeof postsTable.$inferSelect, viewerId: string, source: GroupQuerySource = db) {
  if (!post.groupId || post.audience !== "this_group") return false;
  const group = (await source.select().from(groupsTable).where(and(
    eq(groupsTable.id, post.groupId),
    eq(groupsTable.status, "active"),
  )).limit(1))[0];
  if (!group || !(await activeGroupMembership(group.id, post.authorMemberId, source))) return false;
  if (group.contentVisibility === "members" || group.discoverability === "private") {
    return !!(await activeGroupMembership(group.id, viewerId, source));
  }
  return !!(await activeGroupMembership(group.id, viewerId, source)) || group.discoverability === "public";
}