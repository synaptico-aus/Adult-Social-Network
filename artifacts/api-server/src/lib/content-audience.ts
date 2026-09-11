import { canViewAudience, resolveRelationshipViewer, type ContentAudience } from "./audience-policy";
import { friendshipsTable, safetyRelationshipsTable } from "@workspace/db";

/** Shared authorization entry point for future content reads. */
export async function canViewMemberContent(
  db: Parameters<typeof resolveRelationshipViewer>[0],
  ownerMemberId: string,
  viewerMemberId: string,
  audience: ContentAudience,
): Promise<boolean> {
  const viewer = await resolveRelationshipViewer(db, { friendshipsTable, safetyRelationshipsTable }, ownerMemberId, viewerMemberId);
  return canViewAudience(audience, viewer);
}