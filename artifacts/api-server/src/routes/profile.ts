import { Router, type IRouter, type Request } from "express";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { resourceReportsTable } from "@workspace/db";
import { circleHistoryGrantsTable, circleInvitationsTable, circleMembersTable, circlesTable, db, membersTable, mediaAssetsTable, profilesTable, thisIsMeCardsTable, verificationRequestsTable, consentHistoryTable, friendRequestsTable, friendshipsTable, followsTable, discoverySettingsTable, postsTable, commentsTable, postReactionsTable, postSavesTable, postHidesTable, groupMembersTable, groupsTable, groupMembershipRequestsTable, groupHostAssignmentsTable, groupWelcomeRequestsTable, reportsTable, communityHostTrainingTable, conversationsTable, conversationMembersTable, messagesTable, messageMemberRemovalsTable, messageRequestsTable, messageContactSettingsTable, notificationPreferencesTable, deviceRegistrationsTable, messageReportsTable, educationSavesTable, educationProgressTable } from "@workspace/db";
import { requireAuth } from "../middlewares/account-auth";
import { liveConversationMember } from "../lib/conversation-access";
import { PROFILE_FIELDS, defaultVisibility, visibleProfile, isAssistedAccessInput, isOwnedProfilePhotoPath, cardPayloadIsTextOnly } from "../lib/profile-policy";
import { profilePhotoFile, requestProfilePhotoUpload } from "../lib/profile-photo-storage";
import { Readable } from "node:stream";
import { exportOperations } from "../lib/operations-data";
import { moduleExportManifest } from "../lib/module-export";
import "../lib/profile-deletion-hook";
import { visiblePost } from "./posts";
import { exportMemberMemories } from "../lib/memory-access";
import { exportExperience } from "../lib/experience-data";

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
async function cardMedia(card: typeof thisIsMeCardsTable.$inferSelect) {
  if (!card.mediaAssetIds?.length) return [];
  const assets = await db.select().from(mediaAssetsTable).where(inArray(mediaAssetsTable.id, card.mediaAssetIds));
  return assets.filter((a) => a.status === "ready" || card.memberId === card.memberId).map((a) => ({
    id: a.id, kind: a.kind, contentType: a.contentType, byteSize: a.byteSize, width: a.width, height: a.height,
    durationSeconds: a.durationSeconds, status: a.status, altText: a.altText, transcript: a.transcript,
    limitation: a.status === "held" ? (a.rejectionReason ?? "Media checks are pending") : null,
  }));
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
  const cards = await db.select().from(thisIsMeCardsTable).where(eq(thisIsMeCardsTable.memberId, member.id)).orderBy(asc(thisIsMeCardsTable.position));
  res.json(await Promise.all(cards.map(async (card) => ({ ...card, mediaAssets: await cardMedia(card) }))));
});
router.post("/this-is-me", async (req, res): Promise<void> => {
  if (isAssistedAccessInput(req.body)) { res.status(400).json({ error: "Delegated or relative account identity is not supported" }); return; }
  const parsed = z.object({ kind: z.enum(["things_i_enjoy", "music_i_love", "experiences_i_want_to_share", "how_i_like_to_communicate"]), text: z.string().trim().min(1).max(5000), permissionAcknowledged: z.boolean().default(false), mediaAssetIds: z.array(z.string()).max(10).default([]) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const member = await ownMember(req); if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const media = parsed.data.mediaAssetIds.length ? await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.ownerMemberId, member.id), inArray(mediaAssetsTable.id, parsed.data.mediaAssetIds))) : [];
  if (media.length !== parsed.data.mediaAssetIds.length || media.some((asset) => asset.status !== "ready")) { res.status(409).json({ error: "All attached media must be ready" }); return; }
  const cards = await db.select().from(thisIsMeCardsTable).where(eq(thisIsMeCardsTable.memberId, member.id)).orderBy(desc(thisIsMeCardsTable.position));
  if (cards.some((card) => card.kind === parsed.data.kind)) { res.status(409).json({ error: "A card of this kind already exists" }); return; }
  const [card] = await db.insert(thisIsMeCardsTable).values({ ...parsed.data, id: randomUUID(), memberId: member.id, position: (cards[0]?.position ?? -1) + 1 }).returning(); res.status(201).json({ ...card, mediaAssets: await cardMedia(card) });
});
router.patch("/this-is-me/:id", async (req, res): Promise<void> => {
  if (isAssistedAccessInput(req.body)) { res.status(400).json({ error: "Delegated or relative account identity is not supported" }); return; }
  const member = await ownMember(req); if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const parsed = z.object({ text: z.string().trim().min(1).max(5000), permissionAcknowledged: z.boolean().optional(), mediaAssetIds: z.array(z.string()).max(10).optional() }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.mediaAssetIds) {
    const media = await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.ownerMemberId, member.id), inArray(mediaAssetsTable.id, parsed.data.mediaAssetIds)));
    if (media.length !== parsed.data.mediaAssetIds.length || media.some((asset) => asset.status !== "ready")) { res.status(409).json({ error: "All attached media must be ready" }); return; }
  }
  const [card] = await db.update(thisIsMeCardsTable).set(parsed.data).where(and(eq(thisIsMeCardsTable.id, String(req.params.id)), eq(thisIsMeCardsTable.memberId, member.id))).returning();
  if (!card) { res.status(404).json({ error: "Card not found" }); return; } res.json({ ...card, mediaAssets: await cardMedia(card) });
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
router.get("/profile/export", async (req, res): Promise<void> => {
  const member = await ownMember(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const profile = (await db.select().from(profilesTable).where(eq(profilesTable.memberId, member.id)).limit(1))[0];
  const cards = await db.select().from(thisIsMeCardsTable).where(eq(thisIsMeCardsTable.memberId, member.id));
  const consents = await db.select().from(consentHistoryTable).where(eq(consentHistoryTable.memberId, member.id));
  const verification = await db.select().from(verificationRequestsTable).where(eq(verificationRequestsTable.memberId, member.id));
  const friendRequests = await db.select().from(friendRequestsTable).where(or(eq(friendRequestsTable.requesterMemberId, member.id), eq(friendRequestsTable.recipientMemberId, member.id)));
  const friendships = await db.select().from(friendshipsTable).where(or(eq(friendshipsTable.memberAId, member.id), eq(friendshipsTable.memberBId, member.id)));
  const follows = await db.select().from(followsTable).where(or(eq(followsTable.followerMemberId, member.id), eq(followsTable.followedMemberId, member.id)));
  const settings = await db.select().from(discoverySettingsTable).where(eq(discoverySettingsTable.memberId, member.id));
  const allPosts = await db.select().from(postsTable).where(eq(postsTable.authorMemberId, member.id));
  // A group post is exportable only when the live group policy still grants
  // access.  Membership/request/welcome rows below remain the member's own
  // accountability history, but never restore access to group content.
  const posts = (await Promise.all(allPosts.map(async (post) => post.groupId && post.audience === "this_group" ? (await visiblePost(post, member.id) ? post : undefined) : post))).filter(Boolean) as typeof allPosts;
  const postIds = new Set(posts.map((post) => post.id));
  const comments = (await db.select().from(commentsTable).where(eq(commentsTable.authorMemberId, member.id))).filter((comment) => postIds.has(comment.postId));
  const reactions = (await db.select().from(postReactionsTable).where(eq(postReactionsTable.memberId, member.id))).filter((reaction) => postIds.has(reaction.postId));
  const saves = (await db.select().from(postSavesTable).where(eq(postSavesTable.memberId, member.id))).filter((save) => postIds.has(save.postId));
  const hides = (await db.select().from(postHidesTable).where(eq(postHidesTable.memberId, member.id))).filter((hide) => postIds.has(hide.postId));
  const circleMemberships = await db.select().from(circleMembersTable).where(eq(circleMembersTable.memberId, member.id));
  const circleIds = circleMemberships.map((row) => row.circleId);
  const circles = circleIds.length ? await db.select().from(circlesTable).where(inArray(circlesTable.id, circleIds)) : [];
  const circleInvitations = await db.select().from(circleInvitationsTable).where(or(eq(circleInvitationsTable.recipientMemberId, member.id), eq(circleInvitationsTable.invitedByMemberId, member.id)));
  const historyAccess = await db.select().from(circleHistoryGrantsTable).where(eq(circleHistoryGrantsTable.memberId, member.id));
  const groupMemberships = await db.select().from(groupMembersTable).where(eq(groupMembersTable.memberId, member.id));
  const groupIds = groupMemberships.map((row) => row.groupId);
  const allGroups = groupIds.length ? await db.select().from(groupsTable).where(inArray(groupsTable.id, groupIds)) : [];
  const groups = (await Promise.all(allGroups.map(async (g) => (await db.select({ id: groupMembersTable.id }).from(groupMembersTable).where(and(eq(groupMembersTable.groupId, g.id), eq(groupMembersTable.memberId, member.id), eq(groupMembersTable.status, "active"))).limit(1))[0] && g.status === "active" ? g : undefined))).filter(Boolean);
  const groupRequests = await db.select().from(groupMembershipRequestsTable).where(eq(groupMembershipRequestsTable.memberId, member.id));
  const groupHosts = await db.select().from(groupHostAssignmentsTable).where(eq(groupHostAssignmentsTable.hostMemberId, member.id));
  const welcomeRequests = await db.select().from(groupWelcomeRequestsTable).where(eq(groupWelcomeRequestsTable.memberId, member.id));
  const hostTraining = await db.select().from(communityHostTrainingTable).where(eq(communityHostTrainingTable.memberId, member.id));
  const reports = await db.select().from(reportsTable).where(eq(reportsTable.reporterMemberId, member.id));
  const conversationMemberships = await db.select().from(conversationMembersTable).where(eq(conversationMembersTable.memberId, member.id));
  const liveConversationMemberships = (await Promise.all(conversationMemberships.filter((row) => row.status === "active").map(async (row) => await liveConversationMember(row.conversationId, member.id) ?? undefined))).filter(Boolean) as typeof conversationMemberships;
  const conversationIds = liveConversationMemberships.map((row) => row.conversationId);
  const conversations = conversationIds.length ? await db.select().from(conversationsTable).where(and(inArray(conversationsTable.id, conversationIds), eq(conversationsTable.status, "active"))) : [];
  const allMessages = conversationIds.length ? await db.select().from(messagesTable).where(inArray(messagesTable.conversationId, conversationIds)) : [];
  const removals = allMessages.length ? await db.select().from(messageMemberRemovalsTable).where(and(eq(messageMemberRemovalsTable.memberId, member.id), inArray(messageMemberRemovalsTable.messageId, allMessages.map((row) => row.id)))) : [];
  const removedMessageIds = new Set(removals.map((row) => row.messageId));
  const messages = allMessages.filter((row) => {
    const membership = liveConversationMemberships.find((item) => item.conversationId === row.conversationId);
    return !!membership && row.createdAt >= membership.joinedAt && !removedMessageIds.has(row.id);
  }).map((row) => row.deletedForEveryoneAt ? { ...row, body: null, mediaAssetIds: [] } : row);
  const messageRequests = await db.select().from(messageRequestsTable).where(or(eq(messageRequestsTable.senderMemberId, member.id), eq(messageRequestsTable.recipientMemberId, member.id)));
  const messageContactSettings = await db.select().from(messageContactSettingsTable).where(eq(messageContactSettingsTable.memberId, member.id));
  const notificationPreferences = await db.select().from(notificationPreferencesTable).where(eq(notificationPreferencesTable.memberId, member.id));
  const deviceRegistrations = (await db.select().from(deviceRegistrationsTable).where(and(eq(deviceRegistrationsTable.memberId, member.id), eq(deviceRegistrationsTable.active, true), or(isNull(deviceRegistrationsTable.expiresAt), gt(deviceRegistrationsTable.expiresAt, new Date()))))).map((row) => ({ ...row, tokenOrEndpoint: `${row.tokenOrEndpoint.slice(0, 4)}…${row.tokenOrEndpoint.slice(-4)}` }));
  const messageReports = await db.select().from(messageReportsTable).where(eq(messageReportsTable.reporterMemberId, member.id));
  const educationSaves = await db.select().from(educationSavesTable).where(eq(educationSavesTable.memberId, member.id));
  const educationProgress = await db.select().from(educationProgressTable).where(eq(educationProgressTable.memberId, member.id));
  const resourceReports = await db.select().from(resourceReportsTable).where(eq(resourceReportsTable.memberId, member.id));
  const memoryData = await exportMemberMemories(member.id);
  const experienceData = await exportExperience(member.id);
  const operationsData = await exportOperations(member.id);
  const ownedMedia = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.ownerMemberId, member.id));
  const mediaManifest = ownedMedia.map(m => ({ id: m.id, kind: m.kind, status: m.status, byteSize: m.byteSize, createdAt: m.createdAt, downloadPath: m.status === "ready" ? `/api/media/${encodeURIComponent(m.id)}` : null,
    note: "Use the authenticated original-media controls for permitted downloads. Held/retained assets are not made public by an export." }));
  const safeDevices = deviceRegistrations.map(d => ({ id: d.id, kind: d.kind, platform: d.platform, active: d.active, expiresAt: d.expiresAt }));
  res.set("Cache-Control", "private, no-store");
  const payload = { memberId: member.id, profile, cards, consents, verification, friendRequests, friendships, follows, settings, posts, comments, reactions, saves, hides, circleMemberships, circles, circleInvitations, historyAccess, groupMemberships, groups, groupRequests, groupHosts, hostTraining, welcomeRequests, reports, conversations, conversationMemberships, messages, messageRequests, messageContactSettings, notificationPreferences, deviceRegistrations: safeDevices, messageReports, educationSaves, educationProgress, resourceReports, memoryData, experienceData, operationsData, mediaManifest, exportedAt: new Date().toISOString() };
  res.json({ ...payload, moduleExports: moduleExportManifest(payload) });
});
export default router;