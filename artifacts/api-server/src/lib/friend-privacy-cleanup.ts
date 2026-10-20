import { db, postsTable, profilesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function purgeFriendPrivacyReferences(memberId: string) {
  await db.update(profilesTable).set({
    friendPermissions: sql`${profilesTable.friendPermissions} - ${memberId}`,
    selectedFriends: sql`coalesce((select jsonb_object_agg(k, case when jsonb_typeof(v) = 'array' then
      coalesce((select jsonb_agg(x) from jsonb_array_elements(v) x where x <> to_jsonb(${memberId}::text)), '[]'::jsonb)
      else v end) from jsonb_each(${profilesTable.selectedFriends}) e(k,v)), '{}'::jsonb)`,
  }).where(sql`${profilesTable.friendPermissions} ? ${memberId} or exists (
    select 1 from jsonb_each(${profilesTable.selectedFriends}) e(k,v)
    where jsonb_typeof(v) = 'array' and v ? ${memberId})`);
  await db.update(postsTable).set({ friendRestrictions: sql`${postsTable.friendRestrictions} - ${memberId}` })
    .where(sql`${postsTable.friendRestrictions} ? ${memberId}`);
}
