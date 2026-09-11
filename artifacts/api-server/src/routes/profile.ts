import { Router, type IRouter, type Request } from "express";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, or } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { db, membersTable, profilesTable, thisIsMeCardsTable, verificationRequestsTable, consentHistoryTable, friendRequestsTable, friendshipsTable, followsTable, discoverySettingsTable, postsTable, commentsTable, postReactionsTable, postSavesTable, postHidesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/account-auth";
import { PROFILE_FIELDS, defaultVisibility, visibleProfile, isAssistedAccessInput, isOwnedProfilePhotoPath, cardPayloadIsTextOnly } from "../lib/profile-policy";
import { profilePhotoFile, requestProfilePhotoUpload } from "../lib/profile-photo-storage";
import { Readable } from "node:stream";
import "../lib/profile-deletion-hook";

const router: IRouter = Router();
router.use("/profile", requireAuth);
router.use("/this-is-me", requireAuth);
router.use("/verification", requireAuth);
router.use("/privacy", requireAuth);
router.use("/consent", requireAuth);
router.use("/profile/export", requireAuth);
router.use("/profile/photo", requireAuth);

async function ownMember(req: Request) {
  const userId = getAuth(req).userId!;
  return (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, userId)).limit(1))[0];
}
const profileInput = z.object({
  preferredName: z.string().trim().min(1),
  photoPath: z.string().startsWith("/objects/").nullable().optional(),
  biography: z.string().max(5000).nullable().optional(),
  language: z.string().max(32).nullable().optional(),
  broadRegion: z.string().max(100).nullable().optional(),
  interests: z.array(z.string().max(100)).optional(),
  dementiaConnection: z.string().max(200).nullable().optional(),
  roles: z.array(z.string().max(100)).max(20).optional(),
  discoverable: z.boolean().optional(),
  visibility: z.record(z.enum(["private", "connections", "members"])).optional(),
}).strict();

router.get("/profile", async (req, res): Promise<void> => {
  const member = await ownMember(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  let profile = (await db.select().from(profilesTable).where(eq(profilesTable.memberId, member.id)).limit(1))[0];
  if (!profile) {
    [profile] = await db.insert(profilesTable).values({ id: randomUUID(), memberId: member.id, preferredName: "Member", visibility: defaultVisibility() }).returning();
  }
  res.json(visibleProfile(profile, "owner"));
});

router.post("/profile/photo/upload-url", async (req, res): Promise<void> => {
  const member = await ownMember(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const parsed = z.object({ contentType: z.string(), size: z.number().int() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const result = await requestProfilePhotoUpload(member.id, parsed.data.contentType, parsed.data.size);
    res.json({ ...result, reminder: "Only upload an image you have permission to use." });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Invalid profile photo" }); }
});

router.get("/profile/photo/:memberId/:photoId", async (req, res): Promise<void> => {
  const member = await ownMember(req);
  const target = String(req.params.memberId);
  if (!member || member.id !== target) { res.status(403).json({ error: "Profile photo is private and owner-scoped" }); return; }
  const file = await profilePhotoFile(`/objects/profile-photos/${target}/${String(req.params.photoId)}`);
  if (!file) { res.status(404).json({ error: "Photo not found" }); return; }
  const [metadata] = await file.getMetadata();
  res.setHeader("Content-Type", metadata.contentType ?? "application/octet-stream");
  res.setHeader("Cache-Control", "private, no-store");
  Readable.from(file.createReadStream()).pipe(res);
});

router.put("/profile", async (req, res): Promise<void> => {
  if (isAssistedAccessInput(req.body)) { res.status(400).json({ error: "Delegated or relative account identity is not supported" }); return; }
  const parsed = profileInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const member = await ownMember(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  let photoMetadata: { photoMimeType?: string | null; photoSize?: number | null } = {};
  if (parsed.data.photoPath) {
    if (!isOwnedProfilePhotoPath(member.id, parsed.data.photoPath)) {
      res.status(403).json({ error: "Profile photo must belong to the signed-in member" });
      return;
    }
    const file = await profilePhotoFile(parsed.data.photoPath);
    if (!file) {
      res.status(400).json({ error: "Uploaded profile photo was not found" });
      return;
    }
    const [metadata] = await file.getMetadata();
    photoMetadata = {
      photoMimeType: metadata.contentType ?? null,
      photoSize: Number(metadata.size ?? 0) || null,
    };
  }
  const current = (await db.select().from(profilesTable).where(eq(profilesTable.memberId, member.id)).limit(1))[0];
  const data = { ...parsed.data, ...photoMetadata, memberId: member.id, id: current?.id ?? randomUUID(), visibility: parsed.data.visibility ?? current?.visibility ?? defaultVisibility() };
  const [profile] = current
    ? await db.update(profilesTable).set(data).where(eq(profilesTable.memberId, member.id)).returning()
    : await db.insert(profilesTable).values({ ...data, preferredName: data.preferredName }).returning();
  res.json(visibleProfile(profile, "owner"));
});

router.get("/profile/view-as-member", async (req, res): Promise<void> => {
  const member = await ownMember(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const profile = (await db.select().from(profilesTable).where(eq(profilesTable.memberId, member.id)).limit(1))[0];
  if (!profile) { res.json({}); return; }
  res.json(visibleProfile(profile, "member"));
});

router.patch("/privacy", async (req, res): Promise<void> => {
  const member = await ownMember(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const parsed = z.object({ discoverable: z.boolean().optional(), visibility: z.record(z.enum(["private", "connections", "members"])).optional() }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.visibility && Object.keys(parsed.data.visibility).some((field) => !PROFILE_FIELDS.includes(field as typeof PROFILE_FIELDS[number]))) {
    res.status(400).json({ error: "Unknown profile field in visibility settings" });
    return;
  }
  const profile = (await db.select().from(profilesTable).where(eq(profilesTable.memberId, member.id)).limit(1))[0];
  if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }
  const [updated] = await db.update(profilesTable).set({ ...parsed.data, visibility: parsed.data.visibility ?? profile.visibility }).where(eq(profilesTable.memberId, member.id)).returning();
  await db.insert(consentHistoryTable).values({ id: randomUUID(), memberId: member.id, purpose: "profile_sharing", version: "phase-3", granted: parsed.data.discoverable ?? profile.discoverable, scope: Object.keys(parsed.data.visibility ?? {}) });
  res.json(updated);
});

router.get("/this-is-me", async (req, res): Promise<void> => {
  const member = await ownMember(req); if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  res.json(await db.select().from(thisIsMeCardsTable).where(eq(thisIsMeCardsTable.memberId, member.id)).orderBy(asc(thisIsMeCardsTable.position)));
});
router.post("/this-is-me", async (req, res): Promise<void> => {
  if (isAssistedAccessInput(req.body) || !cardPayloadIsTextOnly(req.body)) { res.status(400).json({ error: "Cards are text-only; photo, audio, and media cards wait until Phase 7" }); return; }
  const parsed = z.object({ kind: z.enum(["things_i_enjoy", "music_i_love", "experiences_i_want_to_share", "how_i_like_to_communicate"]), text: z.string().trim().min(1).max(5000), permissionAcknowledged: z.boolean().default(false) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const member = await ownMember(req); if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const cards = await db.select().from(thisIsMeCardsTable).where(eq(thisIsMeCardsTable.memberId, member.id)).orderBy(desc(thisIsMeCardsTable.position));
  if (cards.some((card) => card.kind === parsed.data.kind)) { res.status(409).json({ error: "A card of this kind already exists" }); return; }
  const [card] = await db.insert(thisIsMeCardsTable).values({ ...parsed.data, id: randomUUID(), memberId: member.id, position: (cards[0]?.position ?? -1) + 1 }).returning(); res.status(201).json(card);
});
router.patch("/this-is-me/:id", async (req, res): Promise<void> => {
  if (isAssistedAccessInput(req.body) || !cardPayloadIsTextOnly(req.body)) { res.status(400).json({ error: "Cards are text-only; media waits until Phase 7" }); return; }
  const member = await ownMember(req); if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const parsed = z.object({ text: z.string().trim().min(1).max(5000), permissionAcknowledged: z.boolean().optional() }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [card] = await db.update(thisIsMeCardsTable).set(parsed.data).where(and(eq(thisIsMeCardsTable.id, String(req.params.id)), eq(thisIsMeCardsTable.memberId, member.id))).returning();
  if (!card) { res.status(404).json({ error: "Card not found" }); return; } res.json(card);
});
router.delete("/this-is-me/:id", async (req, res): Promise<void> => {
  const member = await ownMember(req); if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const deleted = await db.delete(thisIsMeCardsTable).where(and(eq(thisIsMeCardsTable.id, String(req.params.id)), eq(thisIsMeCardsTable.memberId, member.id))).returning(); if (!deleted.length) { res.status(404).json({ error: "Card not found" }); return; } res.sendStatus(204);
});
router.post("/verification", async (req, res): Promise<void> => {
  const member = await ownMember(req); if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const existing = (await db.select().from(verificationRequestsTable).where(and(eq(verificationRequestsTable.memberId, member.id), eq(verificationRequestsTable.status, "pending"))).limit(1))[0];
  if (existing) { res.status(409).json({ error: "A verification request is already pending" }); return; }
  const parsed = z.object({ scope: z.string().min(1), evidence: z.string().max(5000).optional(), notes: z.string().max(5000).optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [request] = await db.insert(verificationRequestsTable).values({ ...parsed.data, id: randomUUID(), memberId: member.id }).returning(); await db.insert(consentHistoryTable).values({ id: randomUUID(), memberId: member.id, purpose: "verification_request", version: "phase-3", granted: true, scope: [parsed.data.scope] }); res.status(201).json(request);
});
router.get("/verification", async (req, res): Promise<void> => { const member = await ownMember(req); if (!member) { res.status(404).json({ error: "Onboarding required" }); return; } res.json(await db.select().from(verificationRequestsTable).where(eq(verificationRequestsTable.memberId, member.id)).orderBy(desc(verificationRequestsTable.createdAt))); });
router.get("/consent", async (req, res): Promise<void> => { const member = await ownMember(req); if (!member) { res.status(404).json({ error: "Onboarding required" }); return; } res.json(await db.select().from(consentHistoryTable).where(eq(consentHistoryTable.memberId, member.id)).orderBy(desc(consentHistoryTable.recordedAt))); });
router.post("/consent/revoke", async (req, res): Promise<void> => { const member = await ownMember(req); if (!member) { res.status(404).json({ error: "Onboarding required" }); return; } const parsed = z.object({ purpose: z.string(), version: z.string() }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; } const [record] = await db.insert(consentHistoryTable).values({ id: randomUUID(), memberId: member.id, purpose: parsed.data.purpose, version: parsed.data.version, granted: false }).returning(); res.status(201).json(record); });
router.get("/profile/export", async (req, res): Promise<void> => { const member = await ownMember(req); if (!member) { res.status(404).json({ error: "Onboarding required" }); return; } const profile = (await db.select().from(profilesTable).where(eq(profilesTable.memberId, member.id)).limit(1))[0]; const cards = await db.select().from(thisIsMeCardsTable).where(eq(thisIsMeCardsTable.memberId, member.id)); const consents = await db.select().from(consentHistoryTable).where(eq(consentHistoryTable.memberId, member.id)); const verification = await db.select().from(verificationRequestsTable).where(eq(verificationRequestsTable.memberId, member.id)); const friendRequests = await db.select().from(friendRequestsTable).where(or(eq(friendRequestsTable.requesterMemberId, member.id), eq(friendRequestsTable.recipientMemberId, member.id))); const friendships = await db.select().from(friendshipsTable).where(or(eq(friendshipsTable.memberAId, member.id), eq(friendshipsTable.memberBId, member.id))); const follows = await db.select().from(followsTable).where(or(eq(followsTable.followerMemberId, member.id), eq(followsTable.followedMemberId, member.id))); const settings = await db.select().from(discoverySettingsTable).where(eq(discoverySettingsTable.memberId, member.id)); const posts = await db.select().from(postsTable).where(eq(postsTable.authorMemberId, member.id)); const comments = await db.select().from(commentsTable).where(eq(commentsTable.authorMemberId, member.id)); const reactions = await db.select().from(postReactionsTable).where(eq(postReactionsTable.memberId, member.id)); const saves = await db.select().from(postSavesTable).where(eq(postSavesTable.memberId, member.id)); const hides = await db.select().from(postHidesTable).where(eq(postHidesTable.memberId, member.id)); res.json({ memberId: member.id, profile, cards, consents, verification, friendRequests, friendships, follows, settings, posts, comments, reactions, saves, hides, exportedAt: new Date().toISOString() }); });
export default router;