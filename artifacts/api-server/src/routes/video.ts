import { Router, type Request } from "express";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { db, mediaAssetsTable, membersTable, mediaScreeningResultsTable, mediaVariantsTable, videoJobsTable } from "@workspace/db";
import { requireAuth, memberRateLimit } from "../middlewares/account-auth";
import { requireStaffCapability } from "../middlewares/staff-auth";
import { CorrectVideoCaptionsBody, DecideVideoReviewBody } from "@workspace/api-zod";
import { mediaResponse } from "../lib/media-response";
import { canReadMedia } from "../lib/media-authority";
import { serveVideoAsset, validateCaptionCues } from "../lib/video-delivery";
const router = Router();
router.use("/media", requireAuth);
async function member(req: Request) {
  const id = getAuth(req).userId;
  return id ? (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, id)).limit(1))[0] : undefined;
}
router.get("/media/:id/status", async (req, res): Promise<void> => {
  const m = await member(req);
  const [asset] = m ? await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.id, String(req.params.id)), eq(mediaAssetsTable.ownerMemberId, m.id))).limit(1) : [];
  if (!asset) { res.status(404).end(); return; }
  res.set("Cache-Control", "private, no-store").json(mediaResponse(asset));
});
router.get("/media/:id/assets/:variant", async (req, res): Promise<void> => {
  const variant = z.enum(["standard", "low", "webm", "thumbnail", "captions", "transcript"]).safeParse(req.params.variant);
  const m = await member(req);
  const [asset] = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, String(req.params.id))).limit(1);
  // Held output may be previewed only by its uploader; it cannot be published.
  const previewOwner = asset && m && asset.ownerMemberId === m.id && asset.status === "held";
  if (!variant.success || !m || !asset || asset.kind !== "video" || (!previewOwner && asset.status !== "ready") || !(await canReadMedia(asset, m.id))) { res.status(404).end(); return; }
  await serveVideoAsset(asset, variant.data, req, res);
});
router.patch("/media/:id/captions", memberRateLimit(10, 60000, "video-captions"), async (req, res): Promise<void> => {
  const m = await member(req), parsed = CorrectVideoCaptionsBody.strict().safeParse(req.body);
  if (!m || !parsed.success) { res.status(400).json({ error: "Invalid caption correction" }); return; }
  const result = await db.transaction(async (tx) => {
    const [asset] = await tx.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.id, String(req.params.id)), eq(mediaAssetsTable.ownerMemberId, m.id))).for("update");
    if (!asset || asset.kind !== "video") return { error: "Video not found", code: 404 };
    if (!["held", "ready"].includes(asset.status) || !asset.durationSeconds) return { error: "Wait for video processing", code: 409 };
    if (asset.captionVersion !== parsed.data.captionVersion) return { error: "Captions changed; refresh before correcting", code: 409 };
    try { validateCaptionCues(parsed.data.cues, asset.durationSeconds, parsed.data.captionState === "no_speech"); }
    catch { return { error: "Invalid caption timestamps, content or speech declaration", code: 400 }; }
    const cues = parsed.data.cues.map((cue) => ({ ...cue, text: cue.text.trim().replace(/[\r\n]+/g, " ") }));
    const [row] = await tx.update(mediaAssetsTable).set({ captions: cues, captionState: parsed.data.captionState,
      captionVersion: asset.captionVersion + 1, transcript: parsed.data.captionState === "no_speech" ? "No speech, as declared by uploader" : cues.map((cue) => cue.text).join("\n"),
      status: "held", abuseState: "pending", rejectionReason: "Caption correction requires a new independent full-video/audio review",
    }).where(eq(mediaAssetsTable.id, asset.id)).returning();
    await tx.insert(mediaScreeningResultsTable).values({ id: randomUUID(), assetId: asset.id, kind: "caption_correction", provider: "owner", state: "pending",
      details: { actor: getAuth(req).userId, captionVersion: row.captionVersion } });
    return { row, code: 200 };
  });
  if (!result.row) { res.status(result.code).json({ error: result.error }); return; }
  res.json(mediaResponse(result.row));
});
router.get("/staff/video-review", ...requireStaffCapability("moderation.decide"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.kind, "video"), inArray(mediaAssetsTable.status, ["held", "quarantined"]))).orderBy(asc(mediaAssetsTable.createdAt)).limit(100);
  res.set("Cache-Control", "private, no-store").json({ items: rows.map(mediaResponse) });
});
router.get("/staff/video-review/:id/assets/:variant", ...requireStaffCapability("moderation.decide"), async (req, res): Promise<void> => {
  const reason = z.string().trim().min(1).max(1000).safeParse(req.query.reason);
  const variant = z.enum(["standard", "low", "webm", "thumbnail", "captions", "transcript", "frames", "audio"]).safeParse(req.params.variant);
  if (!reason.success || !variant.success) { res.status(400).json({ error: "Exact review reason and asset required" }); return; }
  const [asset] = await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.id, String(req.params.id)), eq(mediaAssetsTable.kind, "video"), eq(mediaAssetsTable.status, "held"))).limit(1);
  if (!asset) { res.status(404).end(); return; }
  await db.insert(mediaScreeningResultsTable).values({ id: randomUUID(), assetId: asset.id, kind: "video_review_access", provider: "staff-audit", state: "allowed",
    details: { actor: getAuth(req).userId, reason: reason.data, variant: variant.data, captionVersion: asset.captionVersion } });
  await serveVideoAsset(asset, variant.data, req, res);
});
router.post("/staff/video-review/:id/decision", ...requireStaffCapability("moderation.decide"), async (req, res): Promise<void> => {
  const parsed = DecideVideoReviewBody.strict().safeParse(req.body), m = await member(req);
  if (!parsed.success || !m || !parsed.data.reason.trim()) { res.status(400).json({ error: "Video decision and reason required" }); return; }
  const result = await db.transaction(async (tx) => {
    const [asset] = await tx.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, String(req.params.id))).for("update");
    if (!asset || asset.kind !== "video" || asset.status !== "held") return { code: 409, error: "Video is not awaiting review" };
    if (asset.ownerMemberId === m.id) return { code: 403, error: "An independent reviewer is required" };
    if (asset.captionVersion !== parsed.data.captionVersion) return { code: 409, error: "Caption revision changed; refresh and review again" };
    const [job] = await tx.select().from(videoJobsTable).where(eq(videoJobsTable.assetId, asset.id)).limit(1);
    const variants = await tx.select().from(mediaVariantsTable).where(eq(mediaVariantsTable.assetId, asset.id));
    if (parsed.data.decision === "allow") {
      const accesses = await tx.select().from(mediaScreeningResultsTable).where(and(eq(mediaScreeningResultsTable.assetId, asset.id), eq(mediaScreeningResultsTable.kind, "video_review_access"))).orderBy(desc(mediaScreeningResultsTable.createdAt)).limit(100);
      const sawVideo = accesses.some((entry) => {
        const details = entry.details as any;
        return details?.actor === getAuth(req).userId && details.captionVersion === asset.captionVersion && ["standard", "low", "webm"].includes(details.variant);
      });
      if (!sawVideo || !parsed.data.watchedEntireVideo || !parsed.data.listenedEntireAudio || job?.state !== "complete" ||
          asset.captionState === "unavailable" || !variants.some((v) => v.kind === "standard") || !variants.some((v) => v.kind === "low")) {
        return { code: 409, error: "Processed playback, captions/no-speech declaration, audited full-video access and complete video/audio review required" };
      }
      if (asset.malwareState === "blocked") return { code: 409, error: "Blocked malware cannot be overridden" };
    }
    const allow = parsed.data.decision === "allow" && asset.malwareState === "allowed";
    const rejected = parsed.data.decision === "reject";
    const [updated] = await tx.update(mediaAssetsTable).set({ status: rejected ? "rejected" : allow ? "ready" : "held",
      abuseState: rejected ? "blocked" : parsed.data.decision === "allow" ? "allowed" : "pending",
      rejectionReason: rejected ? parsed.data.reason.trim() : allow ? null : parsed.data.decision === "allow" ? "Full human review recorded; required malware screening is still unavailable" : parsed.data.reason.trim(),
    }).where(eq(mediaAssetsTable.id, asset.id)).returning();
    await tx.insert(mediaScreeningResultsTable).values({ id: randomUUID(), assetId: asset.id, kind: "video_full_human_review", provider: "staff",
      state: rejected ? "blocked" : parsed.data.decision === "allow" ? "allowed" : "pending",
      details: { actor: getAuth(req).userId, reason: parsed.data.reason.trim(), captionVersion: asset.captionVersion,
        watchedEntireVideo: parsed.data.watchedEntireVideo, listenedEntireAudio: parsed.data.listenedEntireAudio,
        coverage: "Entire processed video and complete audio; sampled frames alone are insufficient" } });
    return { code: 200, row: updated };
  });
  if (!result.row) { res.status(result.code).json({ error: result.error }); return; }
  res.json(mediaResponse(result.row));
});
export default router;
