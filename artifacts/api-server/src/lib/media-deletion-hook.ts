import { and, eq, lt, or } from "drizzle-orm";
import { db, mediaAssetsTable } from "@workspace/db";
import { registerDeletionHook } from "./deletion-hooks";
import { deleteMediaObject } from "./media-storage";

registerDeletionHook({
  name: "phase-7-media",
  async run({ memberId }) {
    const assets = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.ownerMemberId, memberId));
    for (const asset of assets) {
      let deleted = true;
      await deleteMediaObject(asset.objectPath).catch(async () => {
        deleted = false;
        await db.update(mediaAssetsTable).set({ status: "cleanup_pending", updatedAt: new Date() }).where(eq(mediaAssetsTable.id, asset.id));
      });
      if (deleted) await db.delete(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id));
    }
  },
});

/** Worker entry point: expired interrupted uploads are quarantined then removed. */
export async function cleanupExpiredMedia(now = new Date()) {
  const expired = await db.select().from(mediaAssetsTable).where(and(lt(mediaAssetsTable.expiresAt, now), or(eq(mediaAssetsTable.status, "uploading"), eq(mediaAssetsTable.status, "cancelled"))));
  for (const asset of expired) {
    let deleted = true;
    await deleteMediaObject(asset.objectPath).catch(async () => {
      deleted = false;
      await db.update(mediaAssetsTable).set({ status: "cleanup_pending", updatedAt: new Date() }).where(eq(mediaAssetsTable.id, asset.id));
    });
    if (deleted) await db.delete(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id));
  }
  return expired.length;
}