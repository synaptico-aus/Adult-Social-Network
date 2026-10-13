import { Router, type Request } from "express";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { db, membersTable, mediaAssetsTable, postsTable, thisIsMeCardsTable, messagesTable, conversationsTable, conversationMembersTable, messageMemberRemovalsTable, safetyRelationshipsTable, videoJobsTable } from "@workspace/db";
import { requireAuth, memberRateLimit } from "../middlewares/account-auth";
import { liveConversationMember } from "../lib/conversation-access";
import { deleteMediaObject, mediaFile, mediaObjectPath, requestMediaUpload, freezeMediaObject } from "../lib/media-storage";
import { validateDeclared } from "../lib/media-validation";
import { completeNonVideo } from "../lib/non-video-screening";
import "../lib/media-deletion-hook";
import { visiblePost } from "./posts";
import { mediaResponse } from "../lib/media-response";
import { serveVideoAsset } from "../lib/video-delivery";
import { deleteMediaWithVariants } from "../lib/media-deletion-hook";

const router = Router();
router.use("/media", requireAuth);
const requestBody = z.object({ kind: z.enum(["photo", "audio", "video"]), videoFormat: z.enum(["reel", "post"]).optional(), contentType: z.string(), size: z.number().int().positive(), clientIdempotencyKey: z.string().min(1).max(200), altText: z.string().trim().min(1).max(1000).optional() }).strict();
async function member(req: Request) { const user = getAuth(req).userId; return user ? (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, user)).limit(1))[0] : undefined; }

router.post("/media/uploads/request", memberRateLimit(20, 60000, "media-request"), async (req, res): Promise<void> => {
  const m = await member(req); const parsed = requestBody.safeParse(req.body);
  if (!m || !parsed.success) { res.status(400).json({ error: "Invalid media upload request" }); return; }
  if (parsed.data.kind === "photo" && !parsed.data.altText) { res.status(400).json({ error: "Photo altText is required" }); return; }
  if (parsed.data.kind === "video" && !parsed.data.videoFormat) { res.status(400).json({ error: "Select reel or video post" }); return; }
  try { validateDeclared(parsed.data.kind, parsed.data.contentType, parsed.data.size, parsed.data.videoFormat); } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Invalid media" }); return; }
  const existing = (await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.ownerMemberId, m.id), eq(mediaAssetsTable.clientIdempotencyKey, parsed.data.clientIdempotencyKey))).limit(1))[0];
  if (existing) {
    if (existing.kind !== parsed.data.kind || existing.requestedContentType !== parsed.data.contentType || (existing.kind === "video" && existing.videoFormat !== parsed.data.videoFormat)) { res.status(409).json({ error: "Recovery key belongs to a different file type or format" }); return; }
    if (existing.status === "uploading" && existing.expiresAt < new Date()) { res.status(410).json({ error: "Upload recovery expired" }); return; }
    res.json({ asset: mediaResponse(existing), uploadURL: existing.status === "uploading" ? await requestMediaUpload(existing.objectPath) : null }); return;
  }
  if (parsed.data.kind === "video") {
    const pending = await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.ownerMemberId, m.id), eq(mediaAssetsTable.kind, "video"), inArray(mediaAssetsTable.status, ["uploading", "quarantined"]))).limit(3);
    if (pending.length >= 3) { res.status(429).json({ error: "Finish or cancel an existing video before adding another" }); return; }
  }
  const id = randomUUID(); const objectPath = mediaObjectPath(m.id, id);
  const [asset] = await db.insert(mediaAssetsTable).values({ id, ownerMemberId: m.id, kind: parsed.data.kind, videoFormat: parsed.data.videoFormat, byteSize: parsed.data.kind === "video" ? parsed.data.size : null, altText: parsed.data.altText, objectPath, clientIdempotencyKey: parsed.data.clientIdempotencyKey, requestedContentType: parsed.data.contentType, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }).returning();
  res.status(201).json({ asset: mediaResponse(asset), uploadURL: await requestMediaUpload(objectPath) });
});

router.post("/media/uploads/:id/complete", async (req, res): Promise<void> => {
  const m = await member(req); const asset = m && (await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.id, String(req.params.id)), eq(mediaAssetsTable.ownerMemberId, m.id))).limit(1))[0];
  if (!m || !asset) { res.status(404).json({ error: "Media upload not found" }); return; }
  if (asset.status === "ready" || asset.status === "held" || asset.status === "rejected") { res.json(mediaResponse(asset)); return; }
  if (asset.kind === "video") {
    const result = await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id)).for("update");
      if (locked.status === "quarantined") return locked;
      if (locked.status !== "uploading" || locked.expiresAt < new Date()) return null;
      const file = await mediaFile(locked.objectPath);
      if (!file) return null;
      const [metadata] = await file.getMetadata();
      validateDeclared("video", locked.requestedContentType, Number(metadata.size), locked.videoFormat ?? "post");
      if (Number(metadata.size) !== locked.byteSize) throw new Error("Uploaded byte count differs from selected file");
      const frozen = mediaObjectPath(m.id, `${asset.id}_source`);
      // Deterministic path is discoverable for cleanup even after a copy/DB crash.
      await deleteMediaObject(frozen);
      await freezeMediaObject(locked.objectPath, frozen);
      const [updated] = await tx.update(mediaAssetsTable).set({ objectPath: frozen, status: "quarantined",
        metadata: { stagingPath: locked.objectPath }, rejectionReason: "Background video processing queued",
      }).where(eq(mediaAssetsTable.id, locked.id)).returning();
      await tx.insert(videoJobsTable).values({ id: randomUUID(), assetId: asset.id }).onConflictDoNothing();
      return updated;
    }).catch(() => null);
    if (!result) { res.status(409).json({ error: "Video upload incomplete, invalid, expired or cancelled" }); return; }
    res.json(mediaResponse(result)); return;
  }
  try {
    const updated = await completeNonVideo(asset.id);
    if (!updated) { res.status(409).json({ error: "Upload cancelled or removed" }); return; }
    res.json(mediaResponse(updated));
  } catch (e) {
    const [live] = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id));
    if (live && ["held", "rejected"].includes(live.status)) res.status(422).json(mediaResponse(live));
    else res.status(409).json({ error: "Upload incomplete, invalid or no longer eligible" });
  }
});

router.post("/media/uploads/:id/retry", async (req, res): Promise<void> => {
  const m = await member(req); const asset = m && (await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.id, String(req.params.id)), eq(mediaAssetsTable.ownerMemberId, m.id))).limit(1))[0];
  if (!m || !asset) { res.status(404).json({ error: "Media upload not found" }); return; }
  if (asset.kind === "video") {
    if (asset.status !== "uploading" || asset.expiresAt < new Date()) { res.status(409).json({ error: "Video already completed or expired; check processing status instead" }); return; }
    res.json({ asset: mediaResponse(asset), uploadURL: await requestMediaUpload(asset.objectPath) }); return;
  }
  if (asset.status === "ready") { res.json({ asset: mediaResponse(asset), uploadURL: null }); return; }
  if (["held", "quarantined"].includes(asset.status)) {
    // Completed sources are immutable; a retry can recheck them, never issue a new PUT.
    try {
      const updated = asset.status === "held" && asset.malwareState !== "allowed" ? await completeNonVideo(asset.id) : asset;
      if (!updated) { res.status(409).json({ error: "Upload removed" }); return; }
      res.json({ asset: mediaResponse(updated), uploadURL: null }); return;
    } catch {
      const [live] = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id));
      if (live) res.status(422).json(mediaResponse(live)); else res.status(409).json({ error: "Upload removed" });
      return;
    }
  }
  if (asset.status !== "uploading" || asset.expiresAt < new Date()) { res.status(409).json({ error: "Upload no longer accepts replacement bytes" }); return; }
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
  const usedByMessage = (await db.select().from(messagesTable).where(sql`${messagesTable.mediaAssetIds} @> ${JSON.stringify([asset.id])}::jsonb`).limit(1))[0];
  if (usedByMessage) { res.status(409).json({ error: "Attached media must be removed from its message first" }); return; }
  await db.update(mediaAssetsTable).set({ status: "cleanup_pending", cancelledAt: new Date() }).where(eq(mediaAssetsTable.id, asset.id));
  const deleted = await deleteMediaWithVariants(asset).then(() => true).catch(() => false);
  if (!deleted) {
    await db.update(mediaAssetsTable).set({ status: "cleanup_pending", cancelledAt: new Date(), updatedAt: new Date() }).where(eq(mediaAssetsTable.id, asset.id));
    res.status(503).json({ error: "Media cleanup is pending" }); return;
  }
  await db.update(mediaAssetsTable).set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() }).where(eq(mediaAssetsTable.id, asset.id));
  res.sendStatus(204);
});
router.patch(["/media/:id/transcript", "/media/:id"], async (req, res): Promise<void> => {
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
  if (asset.kind === "video") {
    const { canReadMedia } = await import("../lib/media-authority");
    if (!(await canReadMedia(asset, m.id))) { res.status(404).end(); return; }
    await serveVideoAsset(asset, "standard", req, res); return;
  }
  const owns = asset.ownerMemberId === m.id;
  const posts = await db.select().from(postsTable).where(and(sql`${postsTable.mediaAssetIds} @> ${JSON.stringify([asset.id])}::jsonb`, eq(postsTable.status, "published")));
  const visibleAttachment = !owns && (await Promise.all(posts.map((post) => visiblePost(post, m.id)))).some(Boolean);
  // Ownership alone does not bypass a group lifecycle cutoff. A member who
  // left or was removed cannot retrieve media attached to their own group
  // post, even though they still own the underlying upload record.
  const ownGroupAttachmentVisible = owns && (await Promise.all(posts.filter((post) => post.audience === "this_group" && post.authorMemberId === m.id).map((post) => visiblePost(post, m.id)))).every(Boolean);
  const messageRows = await db.select().from(messagesTable).where(sql`${messagesTable.mediaAssetIds} @> ${JSON.stringify([asset.id])}::jsonb`);
  let visibleMessage = false;
  for (const message of messageRows) {
    if (message.deletedForEveryoneAt) continue;
    const conversation = (await db.select().from(conversationsTable).where(and(eq(conversationsTable.id, message.conversationId), eq(conversationsTable.status, "active"))).limit(1))[0];
    const membership = conversation && await liveConversationMember(message.conversationId, m.id);
    const removed = membership && (await db.select({ id: messageMemberRemovalsTable.id }).from(messageMemberRemovalsTable).where(and(eq(messageMemberRemovalsTable.messageId, message.id), eq(messageMemberRemovalsTable.memberId, m.id))).limit(1))[0];
    const participants = conversation && await db.select({ memberId: conversationMembersTable.memberId }).from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, message.conversationId), eq(conversationMembersTable.status, "active")));
    const blockedParticipant = participants
      ? (await db.select({ id: safetyRelationshipsTable.id })
        .from(safetyRelationshipsTable)
        .where(and(
          eq(safetyRelationshipsTable.kind, "block"),
          or(
            and(eq(safetyRelationshipsTable.actorMemberId, m.id), inArray(safetyRelationshipsTable.targetMemberId, participants.map((row) => row.memberId))),
            and(eq(safetyRelationshipsTable.targetMemberId, m.id), inArray(safetyRelationshipsTable.actorMemberId, participants.map((row) => row.memberId))),
          ),
        ))
        .limit(1))[0]
      : undefined;
    if (membership && message.createdAt >= membership.joinedAt && !removed && !blockedParticipant) { visibleMessage = true; break; }
  }
  // This Is Me cards are owner-scoped by the existing profile policy. Do not
  // infer access from a card's memberId: the card route intentionally exposes
  // cards only to their owner until a visibility policy exists.
  if ((messageRows.length > 0 && !visibleMessage) || ((!owns || posts.some((post) => post.audience === "this_group" && post.authorMemberId === m.id)) && !visibleAttachment && !ownGroupAttachmentVisible && !visibleMessage)) { res.status(404).end(); return; }
  let file;
  try { file = await mediaFile(asset.objectPath); } catch {
    // Storage/provider failures must fail closed for protected media rather
    // than turning an authorization-safe miss into an information leak.
    res.status(404).end(); return;
  }
  if (!file) { res.status(404).end(); return; }
  res.setHeader("Cache-Control", "private, no-store, max-age=0"); res.setHeader("Content-Type", asset.contentType ?? "application/octet-stream"); res.setHeader("Content-Disposition", "inline"); Readable.from(file.createReadStream()).pipe(res);
});
export default router;