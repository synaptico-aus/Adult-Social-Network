export const CONTENT_AUDIENCES = ["only_me", "friends", "this_group", "my_circle", "selected_communities", "public"] as const;
export type ContentAudience = typeof CONTENT_AUDIENCES[number];
export type AudienceViewer = { authenticated: boolean; owner?: boolean; friend?: boolean; inGroup?: boolean; inCircle?: boolean; inSelectedCommunity?: boolean };

/**
 * Resolve the relationship portion of audience policy in one place. Blocks
 * always win over friendship: stale relationship rows can never grant access.
 */
export async function resolveRelationshipViewer(
  db: { select: (...args: any[]) => any },
  relationships: { friendshipsTable: any; safetyRelationshipsTable: any },
  ownerMemberId: string,
  viewerMemberId: string,
): Promise<Pick<AudienceViewer, "authenticated" | "owner" | "friend">> {
  if (ownerMemberId === viewerMemberId) return { authenticated: true, owner: true, friend: true };
  const { and, eq, or } = await import("drizzle-orm");
  const blocked = await db.select({ id: relationships.safetyRelationshipsTable.id })
    .from(relationships.safetyRelationshipsTable)
    .where(and(eq(relationships.safetyRelationshipsTable.kind, "block"), or(
      and(eq(relationships.safetyRelationshipsTable.actorMemberId, ownerMemberId), eq(relationships.safetyRelationshipsTable.targetMemberId, viewerMemberId)),
      and(eq(relationships.safetyRelationshipsTable.actorMemberId, viewerMemberId), eq(relationships.safetyRelationshipsTable.targetMemberId, ownerMemberId)),
    ))).limit(1);
  if (blocked[0]) return { authenticated: true, friend: false };
  const [a, b] = ownerMemberId < viewerMemberId ? [ownerMemberId, viewerMemberId] : [viewerMemberId, ownerMemberId];
  const friendship = await db.select({ id: relationships.friendshipsTable.id }).from(relationships.friendshipsTable)
    .where(and(eq(relationships.friendshipsTable.memberAId, a), eq(relationships.friendshipsTable.memberBId, b))).limit(1);
  return { authenticated: true, friend: !!friendship[0] };
}

/** Shared server policy. Anonymous viewers can only see content explicitly marked public. */
export function canViewAudience(audience: ContentAudience, viewer: AudienceViewer): boolean {
  if (audience === "public") return true;
  if (!viewer.authenticated) return false;
  if (audience === "only_me") return viewer.owner === true;
  if (audience === "friends") return viewer.owner || viewer.friend === true;
  if (audience === "this_group") return viewer.owner || viewer.inGroup === true;
  if (audience === "my_circle") return viewer.owner || viewer.inCircle === true;
  return viewer.owner || viewer.inSelectedCommunity === true;
}

export function validateAudience(value: unknown): value is ContentAudience {
  return typeof value === "string" && (CONTENT_AUDIENCES as readonly string[]).includes(value);
}