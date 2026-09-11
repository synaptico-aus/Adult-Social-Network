import { Router, type Request } from "express";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { db, membersTable, mediaAssetsTable, mediaScreeningResultsTable, postsTable, thisIsMeCardsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/account-auth";
import { deleteMediaObject, mediaFile, mediaObjectPath, replaceMediaObject, requestMediaUpload } from "../lib/media-storage";
import { inspectBytes, validateDeclared } from "../lib/media-validation";
import "../lib/media-deletion-hook";
import { visiblePost } from "./posts";

const router = Router();
router.use("/media", requireAuth);
const requestBody = z.object({ kind: z.enum(["photo", "audio"]), contentType: z.string(), size: z.number().int().positive(), clientIdempotencyKey: z.string().min(1).max(200), altText: z.string().trim().min(1).max(1000).optional() }).strict();
async function member(req: Request) { const user = getAuth(req).userId; return user ? (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, user)).limit(1))[0] : undefined; }
function testScan(kind: string) {
  if (process.env.NODE_ENV !== "test" || process.env.MEDIA_TEST_PROVIDER !== "allow") return { state: "unavailable" as const, provider: "unconfigured", details: { reason: "provider_missing" } };
  return { state: "allowed" as const, provider: "test-only", details: { kind } };
}
function mediaResponse(asset: typeof mediaAssetsTable.$inferSelect) {
  return {
    id: asset.id, kind: asset.kind, contentType: asset.contentType, byteSize: asset.byteSize,
    width: asset.width, height: asset.height, durationSeconds: asset.durationSeconds,
    status: asset.status, malwareState: asset.malwareState, abuseState: asset.abuseState,
    altText: asset.altText, transcript: asset.transcript,
    limitation: asset.status === "held" || asset.status === "rejected" ? asset.rejectionReason : null,
  };
}

router.post("/media/uploads/request", async (req, res): Promise<void> => {
  const m = await member(req); const parsed = requestBody.safeParse(req.body);
  if (!m || !parsed.success) { res.status(400).json({ error: "Invalid media upload request" }); return; }
  if (parsed.data.kind === "photo" && !parsed.data.altText) { res.status(400).json({ error: "Photo altText is required" }); return; }
  try { validateDeclared(parsed.data.kind, parsed.data.contentType, parsed.data.size); } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Invalid media" }); return; }
  const existing = (await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.ownerMemberId, m.id), eq(mediaAssetsTable.clientIdempotencyKey, parsed.data.clientIdempotencyKey))).limit(1))[0];
  if (existing) { res.json({ asset: mediaResponse(existing), uploadURL: existing.status === "uploading" ? await requestMediaUpload(existing.objectPath) : null }); return; }
  const id = randomUUID(); const objectPath = mediaObjectPath(m.id, id);
  const [asset] = await db.insert(mediaAssetsTable).values({ id, ownerMemberId: m.id, kind: parsed.data.kind, altText: parsed.data.altText, objectPath, clientIdempotencyKey: parsed.data.clientIdempotencyKey, requestedContentType: parsed.data.contentType, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }).returning();
  res.status(201).json({ asset: mediaResponse(asset), uploadURL: await requestMediaUpload(objectPath) });
});

router.post("/media/uploads/:id/complete", async (req, res): Promise<void> => {
  const m = await member(req); const asset = m && (await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.id, String(req.params.id)), eq(mediaAssetsTable.ownerMemberId, m.id))).limit(1))[0];
  if (!m || !asset) { res.status(404).json({ error: "Media upload not found" }); return; }
  if (asset.status === "ready" || asset.status === "held" || asset.status === "rejected") { res.json(mediaResponse(asset)); return; }
  const file = await mediaFile(asset.objectPath);
  if (!file) { res.status(409).json({ error: "Upload has not completed" }); return; }
  const [metadata] = await file.getMetadata(); const [bytes] = await file.download(); const actualSize = bytes.length;
  try {
    validateDeclared(asset.kind, asset.requestedContentType, actualSize);
    const inspected = await inspectBytes(asset.kind, asset.requestedContentType, bytes);
    if (inspected.sanitizedBytes) await replaceMediaObject(asset.objectPath, inspected.sanitizedBytes, inspected.contentType);
    const malware = testScan("malware"); const abuse = testScan("abuse");
    const durationReady = asset.kind === "photo" || inspected.durationSeconds !== undefined;
    const status = malware.state === "allowed" && abuse.state === "allowed" && durationReady && (asset.kind === "photo" || !!asset.transcript) ? "ready" : "held";
    const limitation = !durationReady ? "Audio duration could not be parsed; a trusted duration provider is required" : malware.state !== "allowed" || abuse.state !== "allowed" ? "Required malware and abuse checks are unavailable" : asset.kind === "audio" && !asset.transcript ? "Transcript is required" : null;
    const [updated] = await db.transaction(async (tx) => {
      await tx.insert(mediaScreeningResultsTable).values([
        { id: randomUUID(), assetId: asset.id, kind: "malware", state: malware.state, provider: malware.provider, details: malware.details },
        { id: randomUUID(), assetId: asset.id, kind: "abuse", state: abuse.state, provider: abuse.provider, details: abuse.details },
      ]);
      return tx.update(mediaAssetsTable).set({ status, byteSize: actualSize, contentType: inspected.contentType, width: inspected.width, height: inspected.height, durationSeconds: inspected.durationSeconds, malwareState: malware.state, abuseState: abuse.state, rejectionReason: limitation, metadata: { storageContentType: metadata.contentType, quarantine: true }, updatedAt: new Date() }).where(eq(mediaAssetsTable.id, asset.id)).returning();
    });
    res.json(mediaResponse(updated));
  } catch (e) {
    const [rejected] = await db.update(mediaAssetsTable).set({ status: "rejected", rejectionReason: e instanceof Error ? e.message : "Media validation failed", updatedAt: new Date() }).where(eq(mediaAssetsTable.id, asset.id)).returning();
    res.status(422).json(mediaResponse(rejected));
  }
});

router.post("/media/uploads/:id/retry", async (req, res): Promise<void> => {
  const m = await member(req); const asset = m && (await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.id, String(req.params.id)), eq(mediaAssetsTable.ownerMemberId, m.id))).limit(1))[0];
  if (!m || !asset) { res.status(404).json({ error: "Media upload not found" }); return; }
  if (asset.status === "ready") { res.json({ asset: mediaResponse(asset), uploadURL: null }); return; }
  await db.update(mediaAssetsTable).set({ status: "uploading", malwareState: "pending", abuseState: "pending", rejectionReason: null, updatedAt: new Date() }).where(eq(mediaAssetsTable.id, asset.id));
  const updated = (await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id)))[0];
  res.json({ asset: mediaResponse(updated), uploadURL: await requestMediaUpload(asset.objectPath) });
});
router.post("/media/uploads/:id/cancel", async (req, res): Promise<void> => {
  const m = await member(req); const asset = m && (await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.id, String(req.params.id)), eq(mediaAssetsTable.ownerMemberId, m.id))).limit(1))[0];
  if (!m || !asset) { res.status(404).end(); return; }
  const usedByPost = (await db.select({ id: postsTable.id }).from(postsTable).where(sql`${postsTable.mediaAssetIds} @> ${JSON.stringify([asset.id])}::jsonb`).limit(1))[0];
  const usedByCard = (await db.select({ id: thisIsMeCardsTable.id }).from(thisIsMeCardsTable).where(sql`${thisIsMeCardsTable.mediaAssetIds} @> ${JSON.stringify([asset.id])}::jsonb`).limit(1))[0];
  if (usedByPost || usedByCard) { res.status(409).json({ error: "Attached media must be removed from its post or card first" }); return; }
  const deleted = await deleteMediaObject(asset.objectPath).then(() => true).catch(() => false);
  if (!deleted) {
    await db.update(mediaAssetsTable).set({ status: "cleanup_pending", cancelledAt: new Date(), updatedAt: new Date() }).where(eq(mediaAssetsTable.id, asset.id));
    res.status(503).json({ error: "Media cleanup is pending" }); return;
  }
  await db.update(mediaAssetsTable).set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() }).where(eq(mediaAssetsTable.id, asset.id));
  res.sendStatus(204);
});
router.patch("/media/:id/transcript", async (req, res): Promise<void> => {
  const m = await member(req); const body = z.object({ transcript: z.string().trim().min(1).max(100000) }).strict().safeParse(req.body);
  const asset = m && (await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.id, String(req.params.id)), eq(mediaAssetsTable.ownerMemberId, m.id))).limit(1))[0];
  if (!m || !asset || !body.success || asset.kind !== "audio") { res.status(400).json({ error: "Audio transcript is invalid" }); return; }
  if (!["held", "ready"].includes(asset.status)) { res.status(409).json({ error: "Audio is not ready for transcript editing" }); return; }
  const status = asset.status === "ready" && asset.malwareState === "allowed" && asset.abuseState === "allowed" && asset.durationSeconds !== null ? "ready" : asset.status;
  const [updated] = await db.update(mediaAssetsTable).set({ transcript: body.data.transcript, status, updatedAt: new Date() }).where(eq(mediaAssetsTable.id, asset.id)).returning(); res.json(mediaResponse(updated));
});

router.get("/media/:id", async (req, res): Promise<void> => {
  const m = await member(req); const asset = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, String(req.params.id))).limit(1).then((x) => x[0]);
  if (!m || !asset || asset.status !== "ready") { res.status(404).end(); return; }
  const owns = asset.ownerMemberId === m.id;
  const posts = await db.select().from(postsTable).where(and(sql`${postsTable.mediaAssetIds} @> ${JSON.stringify([asset.id])}::jsonb`, eq(postsTable.status, "published")));
  const visibleAttachment = !owns && (await Promise.all(posts.map((post) => visiblePost(post, m.id)))).some(Boolean);
  // This Is Me cards are owner-scoped by the existing profile policy. Do not
  // infer access from a card's memberId: the card route intentionally exposes
  // cards only to their owner until a visibility policy exists.
  if (!owns && !visibleAttachment) { res.status(404).end(); return; }
  const file = await mediaFile(asset.objectPath); if (!file) { res.status(404).end(); return; }
  res.setHeader("Cache-Control", "private, no-store, max-age=0"); res.setHeader("Content-Type", asset.contentType ?? "application/octet-stream"); res.setHeader("Content-Disposition", "inline"); Readable.from(file.createReadStream()).pipe(res);
});
export default router;