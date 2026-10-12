import { and, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import { db, mediaAssetsTable, mediaVariantsTable, videoJobsTable, mediaCleanupTasksTable, postsTable, thisIsMeCardsTable, messagesTable, messageReportsTable, messageReportContextTable, retainedEvidenceTable, type MediaAsset } from "@workspace/db";
import { registerDeletionHook } from "./deletion-hooks";
import { deleteMediaObject } from "./media-storage";
import { logger } from "./logger";

export async function mediaHasRetainedEvidence(asset: MediaAsset) {
  const reportedMessage = await db.select().from(messageReportsTable).where(sql`${messageReportsTable.mediaAssetIdsSnapshot} @> ${JSON.stringify([asset.id])}::jsonb`).limit(1);
  const context = await db.select().from(messageReportContextTable).where(sql`${messageReportContextTable.mediaAssetIdsSnapshot} @> ${JSON.stringify([asset.id])}::jsonb`).limit(1);
  const posts = await db.select({ id: postsTable.id }).from(postsTable).where(sql`${postsTable.mediaAssetIds} @> ${JSON.stringify([asset.id])}::jsonb`);
  const retained = posts.length ? await db.select().from(retainedEvidenceTable).where(inArray(retainedEvidenceTable.contentId, posts.map((p) => p.id))).limit(1) : [];
  return !!(reportedMessage.length || context.length || retained.length);
}
export async function deleteMediaWithVariants(asset: MediaAsset) {
  if (await mediaHasRetainedEvidence(asset)) throw new Error("Media retained for reported evidence; ordinary cleanup cannot remove it");
  const variants = await db.select().from(mediaVariantsTable).where(eq(mediaVariantsTable.assetId, asset.id));
  const staging = (asset.metadata as { stagingPath?: string } | null)?.stagingPath;
  const frozenFallback = asset.kind === "video" ? `/objects/media/${asset.ownerMemberId}/${asset.id}_source` : null;
  const paths = [...new Set([asset.objectPath, ...variants.map((v) => v.objectPath), ...(staging ? [staging] : []), ...(frozenFallback ? [frozenFallback] : [])])];
  if (asset.kind === "video") await db.insert(mediaCleanupTasksTable).values({
    assetId: asset.id, paths, nextAttemptAt: new Date(Date.now() + 6 * 60000), expiresAt: new Date(Date.now() + 24 * 60 * 60000),
  }).onConflictDoNothing();
  for (const path of paths) await deleteMediaObject(path);
}
async function hasLiveAttachment(assetId: string) {
  const matches = sql`${postsTable.mediaAssetIds} @> ${JSON.stringify([assetId])}::jsonb`;
  const posts = await db.select().from(postsTable).where(and(matches, ne(postsTable.status, "deleted"))).limit(1);
  const cards = await db.select().from(thisIsMeCardsTable).where(sql`${thisIsMeCardsTable.mediaAssetIds} @> ${JSON.stringify([assetId])}::jsonb`).limit(1);
  const messages = await db.select().from(messagesTable).where(and(sql`${messagesTable.mediaAssetIds} @> ${JSON.stringify([assetId])}::jsonb`, ne(messagesTable.status, "deleted_for_everyone"))).limit(1);
  return !!(posts.length || cards.length || messages.length);
}
export async function cleanupDetachedVideoAssets(ids: string[]) {
  if (!ids.length) return;
  const rows = await db.select().from(mediaAssetsTable).where(and(inArray(mediaAssetsTable.id, ids), eq(mediaAssetsTable.kind, "video")));
  for (const row of rows) if (!(await hasLiveAttachment(row.id))) {
    await db.update(mediaAssetsTable).set({ status: "cleanup_pending", cancelledAt: new Date() }).where(eq(mediaAssetsTable.id, row.id));
    await db.update(videoJobsTable).set({ state: "failed", error: "Video detached/deleted", leaseUntil: null }).where(eq(videoJobsTable.assetId, row.id));
  }
}

registerDeletionHook({
  name: "phase-7-media",
  async run({ memberId }) {
    const assets = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.ownerMemberId, memberId));
    for (const asset of assets) {
      if (await mediaHasRetainedEvidence(asset)) {
        await db.update(mediaAssetsTable).set({ status: "cleanup_pending", rejectionReason: "Retained for reported evidence" }).where(eq(mediaAssetsTable.id, asset.id));
        continue;
      }
      let deleted = true;
      await db.update(mediaAssetsTable).set({ status: "cleanup_pending" }).where(eq(mediaAssetsTable.id, asset.id));
      await deleteMediaWithVariants(asset).catch(async () => {
        deleted = false;
        await db.update(mediaAssetsTable).set({ status: "cleanup_pending", updatedAt: new Date() }).where(eq(mediaAssetsTable.id, asset.id));
      });
      if (deleted) await db.delete(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id));
    }
  },
});

/** Worker entry point: expired interrupted uploads are quarantined then removed. */
export async function cleanupExpiredMedia(now = new Date()) {
  const expired = await db.select().from(mediaAssetsTable).where(or(
    and(lt(mediaAssetsTable.expiresAt, now), or(eq(mediaAssetsTable.status, "uploading"), eq(mediaAssetsTable.status, "cancelled"))),
    eq(mediaAssetsTable.status, "cleanup_pending"))).limit(20);
  for (const asset of expired) {
    if (await mediaHasRetainedEvidence(asset)) continue;
    let deleted = true;
    await deleteMediaWithVariants(asset).catch(async () => {
      deleted = false;
      await db.update(mediaAssetsTable).set({ status: "cleanup_pending", updatedAt: new Date() }).where(eq(mediaAssetsTable.id, asset.id));
    });
    if (deleted) await db.delete(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id));
  }
  return expired.length;
}
export function startMediaCleanup() {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const unused = await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.kind, "video"), eq(mediaAssetsTable.status, "ready"), lt(mediaAssetsTable.expiresAt, new Date()))).limit(20);
      await cleanupDetachedVideoAssets(unused.map((a) => a.id));
      await cleanupExpiredMedia();
      // A live signed PUT can recreate a staging object after the asset is removed.
      // Independent tombstones survive cascades; retry over the upload-expiry window.
      const tasks = await db.select().from(mediaCleanupTasksTable).where(lt(mediaCleanupTasksTable.nextAttemptAt, new Date())).limit(20);
      for (const task of tasks) {
        try {
          for (const path of task.paths) await deleteMediaObject(path);
          if (task.expiresAt < new Date()) await db.delete(mediaCleanupTasksTable).where(eq(mediaCleanupTasksTable.assetId, task.assetId));
          else await db.update(mediaCleanupTasksTable).set({ nextAttemptAt: new Date(Date.now() + 10 * 60000) }).where(eq(mediaCleanupTasksTable.assetId, task.assetId));
        } catch {
          await db.update(mediaCleanupTasksTable).set({ nextAttemptAt: new Date(Date.now() + 60000) }).where(eq(mediaCleanupTasksTable.assetId, task.assetId));
        }
      }
      // An expired PUT may recreate only a staging object, never playback.
      const processed = await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.kind, "video"), ne(mediaAssetsTable.status, "uploading"), lt(mediaAssetsTable.expiresAt, new Date()))).limit(20);
      for (const asset of processed) {
        const staging = (asset.metadata as { stagingPath?: string } | null)?.stagingPath;
        if (staging) await deleteMediaObject(staging);
      }
    } catch (error) { logger.error({ err: error }, "Private media cleanup failed"); }
    finally { busy = false; }
  }, 60000);
  timer.unref();
}