import { z } from "zod";
import { db, profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const interactionSchema = z.object({
  view: z.boolean(), react: z.boolean(), comment: z.boolean(), share: z.boolean(),
}).strict();
export const friendPermissionSchema = z.record(z.string().min(1).max(200), interactionSchema)
  .refine((map) => Object.keys(map).length <= 500, "At most 500 friend settings");
export const selectedFriendsSchema = z.record(z.array(z.string().min(1).max(200)).max(500).nullable());
export type Permissions = z.infer<typeof interactionSchema>;
export type PermissionMap = Record<string, Permissions>;
export const allPermissions: Permissions = { view: true, react: true, comment: true, share: true };
export function samePermissions(left: Permissions, right: Permissions): boolean {
  return (Object.keys(allPermissions) as (keyof Permissions)[]).every((key) => left[key] === right[key]);
}
export function samePermissionMap(left: PermissionMap, right: PermissionMap): boolean {
  return Object.keys(left).length === Object.keys(right).length
    && Object.keys(left).every((id) => !!right[id] && samePermissions(left[id], right[id]));
}
type Source = { select: (...args: any[]) => any };

// Both layers only restrict the existing audience. Neither is an access grant.
export function intersectPermissions(defaults?: Permissions, restrictions?: Permissions, commentsOpen = true): Permissions {
  const view = (defaults?.view ?? true) && (restrictions?.view ?? true);
  return {
    view,
    react: view && (defaults?.react ?? true) && (restrictions?.react ?? true),
    comment: view && commentsOpen && (defaults?.comment ?? true) && (restrictions?.comment ?? true),
    share: view && (defaults?.share ?? true) && (restrictions?.share ?? true),
  };
}
export async function permissionsFor(post: {
  authorMemberId: string; commentsOpen: boolean; friendRestrictions?: PermissionMap;
}, viewer: string, source: Source = db): Promise<Permissions> {
  if (viewer === post.authorMemberId) return { ...allPermissions, comment: post.commentsOpen };
  const [profile] = await source.select({ friendPermissions: profilesTable.friendPermissions })
    .from(profilesTable).where(eq(profilesTable.memberId, post.authorMemberId)).limit(1);
  return intersectPermissions(profile?.friendPermissions?.[viewer], post.friendRestrictions?.[viewer], post.commentsOpen);
}
// Pair -> privacy advisory lock -> post row. The advisory lock also works before
// a first profile exists. Reads remain live; these locks serialize action writes.
export async function lockAuthorPrivacy(source: { execute: (query: any) => any }, author: string) {
  await source.execute(sql`select pg_advisory_xact_lock_shared(hashtextextended(${"privacy:" + author}, 0))`);
}
export async function lockPrivacyUpdate(source: { execute: (query: any) => any }, author: string) {
  await source.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"privacy:" + author}, 0))`);
}
