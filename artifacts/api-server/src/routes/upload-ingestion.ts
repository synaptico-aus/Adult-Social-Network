import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, eq, sql } from "drizzle-orm";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db, membersTable, mediaAssetsTable, profilesTable, uploadAdmissionsTable as admissions } from "@workspace/db";
import { requireAuth } from "../middlewares/account-auth";
import { UploadAdmissionError, retireUpload } from "../lib/upload-admission";
import { spoolUpload } from "../lib/upload-spool";
import { storeIngestedFile, deleteIngestedObject } from "../lib/media-storage";

const router = Router();
router.put("/uploads/:id/bytes", requireAuth, async (req, res): Promise<void> => {
  let directory: string | undefined;
  let claimed = false;
  const id = String(req.params.id);
  try {
    const user = getAuth(req).userId!;
    await db.transaction(async (tx) => {
      // The row lock lasts through receive + private write. A second instance,
      // cancellation or cleanup cannot race a write or reuse a grant.
      const [row] = await tx.select().from(admissions).where(eq(admissions.id, id)).for("update", { noWait: true });
      const [member] = row ? await tx.select().from(membersTable).where(and(eq(membersTable.id, row.ownerMemberId), eq(membersTable.clerkUserId, user))) : [];
      if (!row || !member) throw new UploadAdmissionError(404, "Upload not found");
      if (row.state !== "reserved" || row.expiresAt <= new Date()) throw new UploadAdmissionError(409, "Upload expired or already used");
      if (row.purpose === "media") {
        const [asset] = await tx.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, row.resourceId));
        if (!asset || asset.status !== "uploading" || asset.expiresAt <= new Date()) throw new UploadAdmissionError(409, "Upload no longer accepts bytes");
      }
      if (req.headers["content-type"] !== row.contentType) throw new UploadAdmissionError(415, "Upload content type differs from reservation");
      claimed = true;
      await tx.update(admissions).set({ state: "receiving" }).where(eq(admissions.id, id));
      directory = await mkdtemp(join(tmpdir(), "me-upload-"));
      const path = join(directory, "body");
      await spoolUpload(req, path, row.byteSize);
      // Independent guard at the storage acceptance boundary, after the staged
      // file is closed. Never rely only on the number of network bytes received.
      if ((await stat(path)).size !== row.byteSize) throw new UploadAdmissionError(503, "Staged upload is incomplete");
      await storeIngestedFile(row.objectPath, path, row.contentType);
      await tx.update(admissions).set({ state: "stored", expiresAt: sql`now() + interval '24 hours'` }).where(eq(admissions.id, id));
    });
    res.status(204).end();
  } catch (error) {
    if (claimed) {
      // Never return capacity before cleanup, including ambiguous provider writes.
      await db.update(admissions).set({ state: "cleanup", expiresAt: sql`now() + interval '10 minutes'` }).where(and(eq(admissions.id, id), eq(admissions.state, "reserved"))).catch((err) => req.log.error({ err }, "Upload cleanup state could not be persisted; expiry cleanup remains required"));
    }
    const code = (error as { cause?: { code?: string }; code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    const status = error instanceof UploadAdmissionError ? error.status : code === "55P03" ? 409 : 503;
    // Do not drain an unbounded rejected body or keep its socket available for reuse.
    res.setHeader("Connection", "close");
    res.status(status).json({ error: error instanceof UploadAdmissionError ? error.message : "Upload unavailable; retry after cleanup" });
    res.once("finish", () => req.destroy());
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});
router.post("/uploads/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db.select().from(admissions).where(eq(admissions.id, String(req.params.id)));
  const [member] = row ? await db.select().from(membersTable).where(and(eq(membersTable.id, row.ownerMemberId), eq(membersTable.clerkUserId, getAuth(req).userId!))) : [];
  if (!row || !member) { res.status(404).end(); return; }
  // Media cancellation must go through attachment/evidence checks.
  if (row.purpose !== "profile") { res.status(409).json({ error: "Cancel media from its upload record" }); return; }
  try {
    await retireUpload(row.resourceId, async (tx) => {
      const [attached] = await tx.select({ id: profilesTable.id }).from(profilesTable).where(eq(profilesTable.photoPath, row.objectPath));
      if (attached) throw new UploadAdmissionError(409, "Remove the photo from your profile before cancelling it");
      await deleteIngestedObject(row.objectPath);
    });
  } catch (error) {
    if (!(error instanceof UploadAdmissionError)) await db.update(admissions).set({ state: "cleanup", expiresAt: sql`now() + interval '10 minutes'` }).where(and(eq(admissions.id, row.id), sql`${admissions.state} <> 'released'`));
    throw error;
  }
  res.status(204).end();
});
export default router;
