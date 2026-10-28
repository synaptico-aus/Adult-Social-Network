import { and, eq, sql } from "drizzle-orm";
import { db, uploadAdmissionsTable as admissions, mediaAssetsTable, membersTable, profilesTable } from "@workspace/db";
import { deleteIngestedObject } from "./media-storage";
import { readdir, lstat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "./logger";

/** Durable cleanup owns capacity until removal succeeds, including crash leftovers. */
export async function cleanupUploadAdmissions(now = new Date()) {
  const candidates = await db.execute(sql`select a.id from upload_admissions a
    where a.state <> 'released'
    and not (a.state='stored' and a.purpose='media' and exists(select 1 from media_assets m where m.id=a.resource_id))
    and (
      (a.state in ('reserved','receiving','cleanup') and a.expires_at <= ${now}) or
      not exists(select 1 from members m where m.id=a.owner_member_id and m.active=true and m.deleted_at is null) or
      (a.state='stored' and a.expires_at <= ${now} and (
        (a.purpose='media' and not exists(select 1 from media_assets m where m.id=a.resource_id)) or
        (a.purpose='profile' and not exists(select 1 from profiles p where p.photo_path=a.object_path))
      ))) order by a.expires_at limit 32`);
  for (const { id } of candidates.rows) {
    try {
      await db.transaction(async (tx) => {
        const [row] = await tx.select().from(admissions).where(and(eq(admissions.id, String(id)), sql`${admissions.state} <> 'released'`)).for("update", { skipLocked: true });
        if (!row) return;
        // Recheck after locking: attachment, expiry and ownership may have changed.
        if (row.state === "stored" && row.purpose === "media") {
          const [asset] = await tx.select({ id: mediaAssetsTable.id }).from(mediaAssetsTable).where(eq(mediaAssetsTable.id, row.resourceId));
          // Account deactivation is not permission to erase evidence. The
          // evidence-aware asset lifecycle owns deletion while any asset exists.
          if (asset) return;
        }
        const [owner] = await tx.select({ id: membersTable.id }).from(membersTable).where(and(eq(membersTable.id, row.ownerMemberId), eq(membersTable.active, true), sql`${membersTable.deletedAt} is null`));
        if (row.state === "stored" && owner) {
          if (row.expiresAt > now) return;
          if (row.purpose === "profile") {
            const [profile] = await tx.select({ id: profilesTable.id }).from(profilesTable).where(eq(profilesTable.photoPath, row.objectPath));
            if (profile) return;
          }
        }
        if (row.state !== "stored" && row.expiresAt > now) return;
        await deleteIngestedObject(row.objectPath);
        if (row.state === "cleanup" || row.state === "stored") {
          await tx.update(admissions).set({ state: "released" }).where(eq(admissions.id, row.id));
        } else {
          // An interrupted non-resumable write may have an ambiguous outcome.
          // Retry removal after a window longer than all ingestion deadlines.
          await tx.update(admissions).set({ state: "cleanup", expiresAt: new Date(now.getTime() + 10 * 60000) }).where(eq(admissions.id, row.id));
        }
      });
    } catch (error) { logger.error({ err: error }, "Upload admission cleanup failed; capacity remains reserved"); }
  }
  // Retain issuance accounting for at least a full rolling day.
  await db.delete(admissions).where(and(eq(admissions.state, "released"), sql`${admissions.createdAt} < ${now}::timestamptz - interval '25 hours'`));
  // Local staging is bounded too; reap files left by process crashes.
  for (const entry of await readdir(tmpdir(), { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("me-upload-")) continue;
    const path = join(tmpdir(), entry.name);
    const stat = await lstat(path).catch(() => null);
    if (stat && now.getTime() - stat.mtimeMs > 15 * 60000) await rm(path, { recursive: true, force: true });
  }
}
