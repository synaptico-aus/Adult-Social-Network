import { Router, type Request } from "express";
import { and, asc, desc, eq, gt, gte, inArray, lt, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import {
  conversationMembersTable, conversationsTable, db, friendshipsTable, groupMembersTable,
  groupsTable, membersTable, mediaAssetsTable, messageContactSettingsTable, messageMemberRemovalsTable,
  messageMediaAttachmentsTable, messageRequestsTable, messagesTable, safetyRelationshipsTable,
  messageReportsTable, messageReportContextTable, reportsTable, moderationRecordsTable,
  postsTable, thisIsMeCardsTable,
  profilesTable,
} from "@workspace/db";
import { requireAuth, memberRateLimit } from "../middlewares/account-auth";
import { enqueueNotification } from "./notifications";
import { liveConversationMember } from "../lib/conversation-access";
import { lockGroupAuthority, lockMemberPair } from "../lib/member-locks";

const router = Router();
router.use(["/messages", "/conversations", "/message-requests", "/message-contact-settings"], requireAuth);

const pair = (a: string, b: string): [string, string] => a < b ? [a, b] : [b, a];
const memberFor = async (req: Request) => {
  const userId = getAuth(req).userId;
  return userId ? (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, userId)).limit(1))[0] : undefined;
};
const blocked = async (a: string, b: string, source: any = db) => !!(await source.select({ id: safetyRelationshipsTable.id }).from(safetyRelationshipsTable).where(and(
  eq(safetyRelationshipsTable.kind, "block"),
  or(and(eq(safetyRelationshipsTable.actorMemberId, a), eq(safetyRelationshipsTable.targetMemberId, b)),
    and(eq(safetyRelationshipsTable.actorMemberId, b), eq(safetyRelationshipsTable.targetMemberId, a))),
)).limit(1))[0];
const friends = async (a: string, b: string, source: any = db) => {
  const [x, y] = pair(a, b);
  return !!(await source.select({ id: friendshipsTable.id }).from(friendshipsTable).where(and(eq(friendshipsTable.memberAId, x), eq(friendshipsTable.memberBId, y))).limit(1))[0];
};
const liveGroup = async (groupId: string, memberId: string, source: any = db) => {
  const [group, membership] = await Promise.all([
    source.select({ id: groupsTable.id }).from(groupsTable).where(and(eq(groupsTable.id, groupId), eq(groupsTable.status, "active"))).limit(1),
    source.select({ id: groupMembersTable.id }).from(groupMembersTable).where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.memberId, memberId), eq(groupMembersTable.status, "active"))).limit(1),
  ]);
  return !!group[0] && !!membership[0];
};
const encode = (at: Date, id: string) => Buffer.from(JSON.stringify({ at: at.toISOString(), id }), "utf8").toString("base64url");
function decode(value: unknown): { at: Date; id: string } | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const x = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const at = new Date(x.at);
    return typeof x.id === "string" && !Number.isNaN(at.valueOf()) ? { at, id: x.id } : undefined;
  } catch { return undefined; }
}
const messageInput = z.object({
  body: z.string().max(20_000).nullable().optional(),
  mediaAssetIds: z.array(z.string().min(1)).max(10).default([]),
  idempotencyKey: z.string().trim().min(1).max(200),
}).strict().refine((v) => (v.body != null && v.body.length > 0) || v.mediaAssetIds.length > 0, "Message body or media is required");
const requestInput = z.object({ recipientMemberId: z.string().min(1), body: z.string().min(1).max(20_000), mediaAssetIds: z.array(z.string()).max(10).default([]) }).strict();

async function displayNames(ids: string[], source: any = db) {
  if (!ids.length) return new Map<string, string>();
  const rows = await source.select({ memberId: profilesTable.memberId, preferredName: profilesTable.preferredName }).from(profilesTable).where(inArray(profilesTable.memberId, ids));
  return new Map(rows.map((row: { memberId: string; preferredName: string }) => [row.memberId, row.preferredName]));
}
async function decorateMessage(message: any, viewerId: string, source: any = db) {
  const names = await displayNames([message.senderMemberId], source);
  const mediaAssets = message.deletedForEveryoneAt || message.status === "deleted_for_everyone" || !message.mediaAssetIds.length
    ? []
    : await source.select({
      id: mediaAssetsTable.id, kind: mediaAssetsTable.kind, status: mediaAssetsTable.status,
      altText: mediaAssetsTable.altText, transcript: mediaAssetsTable.transcript, durationSeconds: mediaAssetsTable.durationSeconds,
    }).from(mediaAssetsTable).where(and(inArray(mediaAssetsTable.id, message.mediaAssetIds), eq(mediaAssetsTable.status, "ready")));
  return {
    ...message,
    body: message.deletedForEveryoneAt ? null : message.body,
    mediaAssetIds: message.deletedForEveryoneAt ? [] : message.mediaAssetIds,
    deletedForEveryone: !!message.deletedForEveryoneAt,
    senderDisplayName: names.get(message.senderMemberId) ?? "Member",
    mediaAssets,
  };
}
async function decorateRequest(request: any, source: any = db) {
  const names = await displayNames([request.senderMemberId, request.recipientMemberId], source);
  return { ...request, body: request.body, senderDisplayName: names.get(request.senderMemberId) ?? "Member", recipientDisplayName: names.get(request.recipientMemberId) ?? "Member" };
}
async function conversationParticipants(conversationId: string, source: any = db) {
  const rows = await source.select({
    memberId: conversationMembersTable.memberId, role: conversationMembersTable.role, joinedAt: conversationMembersTable.joinedAt,
  }).from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, conversationId), eq(conversationMembersTable.status, "active")));
  const liveRows = (await Promise.all(rows.map(async (row: any) => await liveConversationMember(conversationId, row.memberId, source) ? row : undefined))).filter(Boolean) as typeof rows;
  const names = await displayNames(liveRows.map((row: { memberId: string }) => row.memberId), source);
  return liveRows.map((row: { memberId: string; role: string; joinedAt: Date }) => ({
    memberId: row.memberId, displayName: names.get(row.memberId) ?? "Member", role: row.role, joinedAt: row.joinedAt,
  }));
}
async function conversationSummary(conversation: any, viewerId: string, membership: any, source: any = db) {
  const participants = await conversationParticipants(conversation.id, source);
  const other = conversation.kind === "direct" ? participants.find((row: { memberId: string }) => row.memberId !== viewerId) : undefined;
  const messages = await source.select().from(messagesTable).where(and(
    eq(messagesTable.conversationId, conversation.id), gte(messagesTable.createdAt, membership.joinedAt),
  )).orderBy(desc(messagesTable.createdAt), desc(messagesTable.id)).limit(20);
  const removed = messages.length ? await source.select({ messageId: messageMemberRemovalsTable.messageId }).from(messageMemberRemovalsTable).where(and(eq(messageMemberRemovalsTable.memberId, viewerId), inArray(messageMemberRemovalsTable.messageId, messages.map((row: any) => row.id)))) : [];
  const removedIds = new Set(removed.map((row: { messageId: string }) => row.messageId));
  const last = messages.find((row: any) => !removedIds.has(row.id));
  const lastMessage = last ? await decorateMessage(last, viewerId, source) : undefined;
  const preview = lastMessage ? {
    id: lastMessage.id,
    preview: lastMessage.deletedForEveryone ? "Message removed" : lastMessage.body ? String(lastMessage.body).slice(0, 120) : lastMessage.mediaAssets.length === 1 && lastMessage.mediaAssets[0].kind === "photo" ? "Photo" : lastMessage.mediaAssets.length === 1 && lastMessage.mediaAssets[0].kind === "audio" ? "Voice note" : lastMessage.mediaAssets.length ? "Attachment" : "Message removed",
    senderDisplayName: lastMessage.senderDisplayName,
    createdAt: lastMessage.createdAt,
  } : null;
  return {
    ...conversation,
    displayTitle: conversation.kind === "group" ? conversation.title : (other?.displayName ?? "Member"),
    participantCount: participants.length,
    participants,
    lastMessage: preview,
    myMembership: membership,
  };
}

async function ownedReadyMedia(memberId: string, ids: string[], source: any = db) {
  if (!ids.length) return true;
  const assets = await source.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.ownerMemberId, memberId), inArray(mediaAssetsTable.id, ids)));
  if (assets.length !== ids.length || assets.some((x: any) => x.status !== "ready" || x.malwareState !== "allowed" || x.abuseState !== "allowed")) return false;
  for (const assetId of ids) {
    const [post, card, message] = await Promise.all([
      source.select({ id: postsTable.id }).from(postsTable).where(sql`${postsTable.mediaAssetIds} @> ${JSON.stringify([assetId])}::jsonb`).limit(1),
      source.select({ id: thisIsMeCardsTable.id }).from(thisIsMeCardsTable).where(sql`${thisIsMeCardsTable.mediaAssetIds} @> ${JSON.stringify([assetId])}::jsonb`).limit(1),
      source.select({ id: messageMediaAttachmentsTable.id }).from(messageMediaAttachmentsTable).where(eq(messageMediaAttachmentsTable.assetId, assetId)).limit(1),
    ]);
    if (post[0] || card[0] || message[0]) return false;
  }
  return true;
}
async function activeMember(conversationId: string, memberId: string, source: any = db) {
  return liveConversationMember(conversationId, memberId, source);
}
async function conversationView(conversationId: string, viewer: string) {
  const [conversation, membership] = await Promise.all([
    db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId)).limit(1).then((x) => x[0]),
    activeMember(conversationId, viewer),
  ]);
  if (!conversation || conversation.status !== "active" || !membership) return undefined;
  if (conversation.kind === "direct" && conversation.memberAId && conversation.memberBId && await blocked(conversation.memberAId, conversation.memberBId)) return undefined;
  if (conversation.kind === "group") {
    const participants = await db.select({ memberId: conversationMembersTable.memberId }).from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, conversation.id), eq(conversationMembersTable.status, "active")));
    for (const participant of participants) if (participant.memberId !== viewer && await blocked(participant.memberId, viewer)) return undefined;
  }
  return { ...conversation, myMembership: membership };
}

router.get("/message-contact-settings", async (req, res): Promise<void> => {
  const member = await memberFor(req); if (!member) { res.status(401).end(); return; }
  const row = (await db.select().from(messageContactSettingsTable).where(eq(messageContactSettingsTable.memberId, member.id)).limit(1))[0];
  res.json(row ?? { memberId: member.id, setting: "friends_only" });
});
router.patch("/message-contact-settings", async (req, res): Promise<void> => {
  const member = await memberFor(req);
  const parsed = z.object({ setting: z.enum(["friends_only", "friends_and_group_members", "any_member_requests"]) }).strict().safeParse(req.body);
  if (!member || !parsed.success) { res.status(400).json({ error: "Invalid contact setting" }); return; }
  const [row] = await db.insert(messageContactSettingsTable).values({ memberId: member.id, setting: parsed.data.setting }).onConflictDoUpdate({ target: messageContactSettingsTable.memberId, set: { setting: parsed.data.setting, updatedAt: new Date() } }).returning();
  res.json(row);
});

router.get("/conversations", async (req, res): Promise<void> => {
  const member = await memberFor(req); if (!member) { res.status(401).end(); return; }
  const rows = await db.select({ conversation: conversationsTable, membership: conversationMembersTable })
    .from(conversationMembersTable).innerJoin(conversationsTable, eq(conversationsTable.id, conversationMembersTable.conversationId))
    .where(and(eq(conversationMembersTable.memberId, member.id), eq(conversationMembersTable.status, "active"), eq(conversationsTable.status, "active")))
    .orderBy(desc(conversationsTable.updatedAt)).limit(100);
  const items = [];
  for (const row of rows) {
    if (!await liveConversationMember(row.conversation.id, member.id)) continue;
    if (row.conversation.kind === "direct" && row.conversation.memberAId && row.conversation.memberBId && await blocked(row.conversation.memberAId, row.conversation.memberBId)) continue;
    if (row.conversation.kind === "group") {
      const participants = await db.select({ memberId: conversationMembersTable.memberId }).from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, row.conversation.id), eq(conversationMembersTable.status, "active")));
      let separated = false; for (const participant of participants) if (participant.memberId !== member.id && await blocked(participant.memberId, member.id)) separated = true;
      if (separated) continue;
    }
    items.push(await conversationSummary(row.conversation, member.id, row.membership));
  }
  res.json({ items, nextCursor: null });
});

router.post("/conversations/direct", memberRateLimit(20, 60_000, "message"), async (req, res): Promise<void> => {
  const member = await memberFor(req);
  const parsed = requestInput.safeParse(req.body);
  if (!member || !parsed.success || parsed.data.recipientMemberId === member.id) { res.status(400).json({ error: "Invalid direct message" }); return; }
  const recipient = (await db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.id, parsed.data.recipientMemberId)).limit(1))[0];
  if (!recipient || await blocked(member.id, recipient.id)) { res.status(404).json({ error: "Recipient is unavailable" }); return; }
  if (!(await ownedReadyMedia(member.id, parsed.data.mediaAssetIds))) { res.status(409).json({ error: "All attached media must be ready and owned" }); return; }
  const [a, b] = pair(member.id, recipient.id);
  const mutual = await friends(member.id, recipient.id);
  const recipientSetting = (await db.select().from(messageContactSettingsTable).where(eq(messageContactSettingsTable.memberId, recipient.id)).limit(1))[0]?.setting ?? "friends_only";
  let allowed = mutual;
  if (!allowed && recipientSetting === "friends_and_group_members") {
    const mine = await db.select({ groupId: groupMembersTable.groupId }).from(groupMembersTable).where(and(eq(groupMembersTable.memberId, member.id), eq(groupMembersTable.status, "active")));
    const ids = mine.map((x) => x.groupId);
    if (ids.length) allowed = await liveGroup(ids[0], recipient.id) || (await db.select({ id: groupMembersTable.id }).from(groupMembersTable).where(and(inArray(groupMembersTable.groupId, ids), eq(groupMembersTable.memberId, recipient.id), eq(groupMembersTable.status, "active"))).limit(1)).length > 0;
  }
  if (!allowed) {
    if (recipientSetting !== "any_member_requests") { res.status(403).json({ error: "Recipient only accepts messages from friends" }); return; }
    const request = await db.transaction(async (tx) => {
      await lockMemberPair(tx, a, b);
      if (await blocked(member.id, recipient.id, tx) || !(await ownedReadyMedia(member.id, parsed.data.mediaAssetIds, tx))) return undefined;
      const cooldown = (await tx.select({ cooldownUntil: messageRequestsTable.cooldownUntil }).from(messageRequestsTable).where(and(eq(messageRequestsTable.memberAId, a), eq(messageRequestsTable.memberBId, b))).orderBy(desc(messageRequestsTable.createdAt)).limit(1))[0]?.cooldownUntil;
      if (cooldown && cooldown > new Date()) return undefined;
      return (await tx.insert(messageRequestsTable).values({ id: randomUUID(), senderMemberId: member.id, recipientMemberId: recipient.id, memberAId: a, memberBId: b, body: parsed.data.body, mediaAssetIds: parsed.data.mediaAssetIds }).onConflictDoNothing().returning())[0];
    });
    if (!request) { res.status(409).json({ error: "A message request already exists" }); return; }
    await enqueueNotification({ recipientMemberId: recipient.id, actorMemberId: member.id, kind: "request", title: "New activity", body: "You have new activity", dedupKey: `message-request:${request.id}` });
    res.status(202).json({ request: await decorateRequest(request), conversation: null }); return;
  }
  const result = await db.transaction(async (tx) => {
    await lockMemberPair(tx, a, b);
    if (await blocked(member.id, recipient.id, tx)) return undefined;
    let conversation = (await tx.select().from(conversationsTable).where(and(eq(conversationsTable.kind, "direct"), eq(conversationsTable.status, "active"), eq(conversationsTable.memberAId, a), eq(conversationsTable.memberBId, b))).limit(1))[0];
    if (!conversation) {
      [conversation] = await tx.insert(conversationsTable).values({ id: randomUUID(), kind: "direct", memberAId: a, memberBId: b, createdByMemberId: member.id }).returning();
      await tx.insert(conversationMembersTable).values([
        { id: randomUUID(), conversationId: conversation.id, memberId: a, role: "member" },
        { id: randomUUID(), conversationId: conversation.id, memberId: b, role: "member" },
      ]);
    }
    if (!(await activeMember(conversation.id, member.id, tx)) || !(await activeMember(conversation.id, recipient.id, tx)) || !(await ownedReadyMedia(member.id, parsed.data.mediaAssetIds, tx))) return undefined;
    const message = await insertMessage(conversation.id, member.id, parsed.data.body ?? null, parsed.data.mediaAssetIds, `direct-${randomUUID()}`, tx);
    await tx.update(conversationsTable).set({ updatedAt: sql`now()` }).where(eq(conversationsTable.id, conversation.id));
    return { conversation, message };
  });
  if (!result) { res.status(403).json({ error: "Recipient is unavailable" }); return; }
  await enqueueNotification({ recipientMemberId: recipient.id, actorMemberId: member.id, kind: "message", title: "New activity", body: "You have new activity", deepLink: "/messages", conversationId: result.conversation.id, messageId: result.message.id, dedupKey: `message:${result.message.id}:${recipient.id}` });
  res.status(201).json({ conversation: await conversationSummary(result.conversation, member.id, await activeMember(result.conversation.id, member.id)), message: await decorateMessage(result.message, member.id) });
});

async function insertMessage(conversationId: string, senderMemberId: string, body: string | null, mediaAssetIds: string[], idempotencyKey: string, source: any = db) {
  const [existing] = await source.select().from(messagesTable).where(and(eq(messagesTable.senderMemberId, senderMemberId), eq(messagesTable.idempotencyKey, idempotencyKey))).limit(1);
  if (existing) return existing;
  const [message] = await source.insert(messagesTable).values({ id: randomUUID(), conversationId, senderMemberId, body, mediaAssetIds, idempotencyKey }).returning();
  if (mediaAssetIds.length) await source.insert(messageMediaAttachmentsTable).values(mediaAssetIds.map((assetId) => ({ id: randomUUID(), messageId: message.id, assetId })));
  return message;
}

router.get("/message-requests", async (req, res): Promise<void> => {
  const member = await memberFor(req); if (!member) { res.status(401).end(); return; }
  const rows = await db.select().from(messageRequestsTable).where(or(eq(messageRequestsTable.senderMemberId, member.id), eq(messageRequestsTable.recipientMemberId, member.id))).orderBy(desc(messageRequestsTable.createdAt)).limit(100);
  const visible = [];
  for (const row of rows) if (!await blocked(row.senderMemberId, row.recipientMemberId)) visible.push(row);
  res.json(await Promise.all(visible.map(async (row) => decorateRequest({ ...row, body: row.status === "pending" || row.senderMemberId === member.id || row.recipientMemberId === member.id ? row.body : null }))));
});
router.post("/message-requests/:id/accept", async (req, res): Promise<void> => {
  const member = await memberFor(req); if (!member) { res.status(401).end(); return; }
  let result;
  try {
    result = await db.transaction(async (tx) => {
    const peek = (await tx.select({ senderMemberId: messageRequestsTable.senderMemberId, recipientMemberId: messageRequestsTable.recipientMemberId }).from(messageRequestsTable).where(and(eq(messageRequestsTable.id, String(req.params.id)), eq(messageRequestsTable.recipientMemberId, member.id))).limit(1))[0];
    if (!peek) return undefined;
    const [a, b] = pair(peek.senderMemberId, peek.recipientMemberId);
    await lockMemberPair(tx, a, b);
    const request = (await tx.select().from(messageRequestsTable).where(and(eq(messageRequestsTable.id, String(req.params.id)), eq(messageRequestsTable.recipientMemberId, member.id))).for("update"))[0];
    if (!request || request.status !== "pending") return undefined;
    if (await blocked(a, b, tx)) return undefined;
    if (!(await ownedReadyMedia(request.senderMemberId, request.mediaAssetIds, tx))) return undefined;
    let conversation = (await tx.select().from(conversationsTable).where(and(eq(conversationsTable.kind, "direct"), eq(conversationsTable.status, "active"), eq(conversationsTable.memberAId, a), eq(conversationsTable.memberBId, b))).limit(1))[0];
    if (!conversation) {
      [conversation] = await tx.insert(conversationsTable).values({ id: randomUUID(), kind: "direct", memberAId: a, memberBId: b, createdByMemberId: member.id }).returning();
      await tx.insert(conversationMembersTable).values([{ id: randomUUID(), conversationId: conversation.id, memberId: a }, { id: randomUUID(), conversationId: conversation.id, memberId: b }]);
    }
    const [updated] = await tx.update(messageRequestsTable).set({ status: "accepted", respondedAt: sql`now()` }).where(and(eq(messageRequestsTable.id, request.id), eq(messageRequestsTable.status, "pending"))).returning();
    if (!updated) return undefined;
    const message = await insertMessage(conversation.id, request.senderMemberId, request.body, request.mediaAssetIds, `request-${request.id}`, tx);
    return { conversation, message, request: updated };
    });
  } catch (error) {
    const dbError = error as { code?: unknown; constraint?: unknown; routine?: unknown };
    const code = typeof dbError.code === "string" ? dbError.code : "";
    const constraint = typeof dbError.constraint === "string" ? dbError.constraint : "";
    const raceConstraint = ["conversation_member_unique", "message_request_pending_pair_unique", "conversations_direct_pair_unique"].includes(constraint);
    if (code === "40001" || code === "40P01" || (code === "23505" && raceConstraint) || (code === "23503" && constraint.includes("message"))) {
      console.error("message request accept raced with relationship change", { code, constraint, routine: dbError.routine });
      res.status(code === "23505" ? 409 : 404).json({ error: "Request unavailable" });
      return;
    }
    throw error;
  }
  if (!result) { res.status(404).json({ error: "Request unavailable" }); return; }
  const liveMembership = await liveConversationMember(result.conversation.id, member.id);
  const visibleMessage = liveMembership ? await decorateMessage(result.message, member.id) : undefined;
  if (!liveMembership || !visibleMessage) {
    res.status(404).json({ error: "Request unavailable" });
    return;
  }
  await enqueueNotification({ recipientMemberId: result.request.senderMemberId, actorMemberId: member.id, kind: "message", title: "New activity", body: "You have new activity", deepLink: "/messages", conversationId: result.conversation.id, messageId: result.message.id, dedupKey: `message:${result.message.id}:${result.request.senderMemberId}` });
  res.json({ ...result, request: await decorateRequest(result.request), conversation: await conversationSummary(result.conversation, member.id, liveMembership), message: visibleMessage });
});
router.post("/message-requests/:id/decline", async (req, res): Promise<void> => {
  const member = await memberFor(req); if (!member) { res.status(401).end(); return; }
  const [row] = await db.update(messageRequestsTable).set({ status: "declined", respondedAt: sql`now()`, cooldownUntil: sql`now() + interval '24 hours'` }).where(and(eq(messageRequestsTable.id, String(req.params.id)), eq(messageRequestsTable.recipientMemberId, member.id), eq(messageRequestsTable.status, "pending"))).returning();
  if (!row) { res.status(404).json({ error: "Request unavailable" }); return; } res.json(await decorateRequest(row));
});
router.post("/message-requests/:id/cancel", async (req, res): Promise<void> => {
  const member = await memberFor(req); if (!member) { res.status(401).end(); return; }
  const [row] = await db.update(messageRequestsTable).set({ status: "cancelled", cancelledAt: sql`now()`, cooldownUntil: sql`now() + interval '24 hours'` }).where(and(eq(messageRequestsTable.id, String(req.params.id)), eq(messageRequestsTable.senderMemberId, member.id), eq(messageRequestsTable.status, "pending"))).returning();
  if (!row) { res.status(404).json({ error: "Request unavailable" }); return; } res.json(await decorateRequest(row));
});

router.post("/conversations/group", async (req, res): Promise<void> => {
  const member = await memberFor(req);
  const parsed = z.object({ memberIds: z.array(z.string().min(1)).min(1).max(100), groupId: z.string().optional(), title: z.string().trim().min(1).max(120) }).strict().safeParse(req.body);
  if (!member || !parsed.success) { res.status(400).json({ error: "Invalid group conversation" }); return; }
  const members = [...new Set([member.id, ...parsed.data.memberIds])];
  if (parsed.data.groupId && (!await liveGroup(parsed.data.groupId, member.id) || !(await db.select({ id: groupsTable.id }).from(groupsTable).where(eq(groupsTable.id, parsed.data.groupId)).limit(1))[0])) { res.status(404).json({ error: "Group unavailable" }); return; }
  for (const target of members.slice(1)) {
    if (await blocked(member.id, target) || !(await friends(member.id, target))) { res.status(403).json({ error: "Only active mutual friends may be added" }); return; }
    if (parsed.data.groupId && !await liveGroup(parsed.data.groupId, target)) { res.status(403).json({ error: "Selected member is not in the active group" }); return; }
  }
  const conversation = await db.transaction(async (tx) => {
    const lockKeys = members.flatMap((left, index) => members.slice(index + 1).map((right) => {
      const [a, b] = pair(left, right); return { key: `${a}:${b}`, a, b };
    })).sort((left, right) => left.key.localeCompare(right.key));
    for (const lock of lockKeys) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lock.key}, 0))`);
    for (const lock of lockKeys) if (await blocked(lock.a, lock.b, tx)) return undefined;
    if (parsed.data.groupId) {
      await lockGroupAuthority(tx, parsed.data.groupId);
      const group = (await tx.select({ id: groupsTable.id }).from(groupsTable).where(and(eq(groupsTable.id, parsed.data.groupId), eq(groupsTable.status, "active"))).for("update").limit(1))[0];
      if (!group) return undefined;
      for (const lock of lockKeys) if (await blocked(lock.a, lock.b, tx)) return undefined;
      for (const memberId of members) if (!await liveGroup(parsed.data.groupId, memberId, tx)) return undefined;
    }
    const [row] = await tx.insert(conversationsTable).values({ id: randomUUID(), kind: "group", groupId: parsed.data.groupId, title: parsed.data.title, createdByMemberId: member.id }).returning();
    await tx.insert(conversationMembersTable).values(members.map((memberId) => ({ id: randomUUID(), conversationId: row.id, memberId, role: memberId === member.id ? "owner" as const : "member" as const })));
    return row;
  });
  if (!conversation) { res.status(403).json({ error: "Conversation unavailable" }); return; }
  res.status(201).json(await conversationSummary(conversation, member.id, await activeMember(conversation.id, member.id)));
});

router.post("/conversations/:conversationId/participants", async (req, res): Promise<void> => {
  const member = await memberFor(req);
  const parsed = z.object({ memberId: z.string().min(1) }).strict().safeParse(req.body);
  if (!member || !parsed.success) { res.status(400).json({ error: "Invalid participant" }); return; }
  const result = await db.transaction(async (tx) => {
    const [pairA, pairB] = pair(member.id, parsed.data.memberId);
    await lockMemberPair(tx, pairA, pairB);
    const selected = (await tx.select({ groupId: conversationsTable.groupId }).from(conversationsTable).where(eq(conversationsTable.id, String(req.params.conversationId))).limit(1))[0];
    if (selected?.groupId) {
      await lockGroupAuthority(tx, selected.groupId);
      const group = (await tx.select({ id: groupsTable.id }).from(groupsTable).where(and(eq(groupsTable.id, selected.groupId), eq(groupsTable.status, "active"))).for("update").limit(1))[0];
      if (!group) return undefined;
    }
    const conversation = (await tx.select().from(conversationsTable).where(eq(conversationsTable.id, String(req.params.conversationId))).for("update"))[0];
    const actor = conversation && await activeMember(conversation.id, member.id, tx);
    if (!conversation || conversation.kind !== "group" || !actor || !["owner", "admin"].includes(actor.role) || await blocked(member.id, parsed.data.memberId, tx) || !(await friends(member.id, parsed.data.memberId, tx))) return undefined;
    const participants = await tx.select({ memberId: conversationMembersTable.memberId }).from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, conversation.id), eq(conversationMembersTable.status, "active")));
    for (const participant of participants) if (participant.memberId !== parsed.data.memberId && await blocked(participant.memberId, parsed.data.memberId, tx)) return undefined;
    if (conversation.groupId && !await liveGroup(conversation.groupId, parsed.data.memberId, tx)) return undefined;
    if (conversation.groupId) await tx.select({ id: groupsTable.id }).from(groupsTable).where(eq(groupsTable.id, conversation.groupId)).for("update").limit(1);
    const [existing] = await tx.select().from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, conversation.id), eq(conversationMembersTable.memberId, parsed.data.memberId))).limit(1);
    if (existing?.status === "active") return existing;
    const [row] = existing
      ? await tx.update(conversationMembersTable).set({ status: "active", joinedAt: sql`now()`, leftAt: null, removedAt: null }).where(eq(conversationMembersTable.id, existing.id)).returning()
      : await tx.insert(conversationMembersTable).values({ id: randomUUID(), conversationId: conversation.id, memberId: parsed.data.memberId }).returning();
    return row;
  });
  if (!result) { res.status(403).json({ error: "Participant cannot be added" }); return; }
  res.status(201).json(result);
});
router.delete("/conversations/:conversationId/participants/:memberId", async (req, res): Promise<void> => {
  const member = await memberFor(req); if (!member) { res.status(401).end(); return; }
  const [row] = await db.transaction(async (tx) => {
    const selected = (await tx.select({ groupId: conversationsTable.groupId }).from(conversationsTable).innerJoin(conversationMembersTable, eq(conversationMembersTable.conversationId, conversationsTable.id)).where(and(eq(conversationsTable.id, String(req.params.conversationId)), eq(conversationMembersTable.memberId, member.id))).limit(1))[0];
    if (selected?.groupId) await lockGroupAuthority(tx, selected.groupId);
    const conversation = (await tx.select().from(conversationsTable).where(eq(conversationsTable.id, String(req.params.conversationId))).for("update"))[0];
    const actor = conversation && await activeMember(conversation.id, member.id, tx);
    const target = conversation && await activeMember(conversation.id, String(req.params.memberId), tx);
    if (!conversation || conversation.kind !== "group" || !actor || !target || !["owner", "admin"].includes(actor.role) || target.role === "owner" || actor.role === "admin" && target.role === "admin") return [];
    return tx.update(conversationMembersTable).set({ status: "removed", removedAt: sql`now()` }).where(eq(conversationMembersTable.id, target.id)).returning();
  });
  if (!row) { res.status(404).json({ error: "Participant not found" }); return; } res.json(row);
});
router.patch("/conversations/:conversationId/participants/:memberId", async (req, res): Promise<void> => {
  const member = await memberFor(req); const parsed = z.object({ role: z.enum(["admin", "member"]) }).strict().safeParse(req.body);
  if (!member || !parsed.success) { res.status(400).json({ error: "Invalid role" }); return; }
  const [row] = await db.transaction(async (tx) => {
    const selected = (await tx.select({ groupId: conversationsTable.groupId }).from(conversationsTable).where(eq(conversationsTable.id, String(req.params.conversationId))).limit(1))[0];
    if (selected?.groupId) await lockGroupAuthority(tx, selected.groupId);
    const conversation = (await tx.select().from(conversationsTable).where(eq(conversationsTable.id, String(req.params.conversationId))).for("update"))[0];
    const actor = conversation && await activeMember(conversation.id, member.id, tx);
    const target = conversation && await activeMember(conversation.id, String(req.params.memberId), tx);
    if (!conversation || conversation.kind !== "group" || !actor || actor.role !== "owner" || !target || target.role === "owner") return [];
    return tx.update(conversationMembersTable).set({ role: parsed.data.role }).where(eq(conversationMembersTable.id, target.id)).returning();
  });
  if (!row) { res.status(404).json({ error: "Participant not found" }); return; } res.json(row);
});
router.post("/conversations/:conversationId/leave", async (req, res): Promise<void> => {
  const member = await memberFor(req); if (!member) { res.status(401).end(); return; }
  const transfer = z.object({ transferToMemberId: z.string().optional() }).strict().safeParse(req.body ?? {});
  if (!transfer.success) { res.status(400).json({ error: "Invalid transfer" }); return; }
  const result = await db.transaction(async (tx) => {
    const selected = (await tx.select({ groupId: conversationsTable.groupId }).from(conversationsTable).where(eq(conversationsTable.id, String(req.params.conversationId))).limit(1))[0];
    if (selected?.groupId) await lockGroupAuthority(tx, selected.groupId);
    const conversation = (await tx.select().from(conversationsTable).where(eq(conversationsTable.id, String(req.params.conversationId))).for("update"))[0];
    const mine = conversation && await activeMember(conversation.id, member.id, tx);
    if (!conversation || !mine) return undefined;
    if (mine.role === "owner") {
      if (!transfer.data.transferToMemberId) return "owner" as const;
      const successor = await activeMember(conversation.id, transfer.data.transferToMemberId, tx);
      if (!successor) return "owner" as const;
      await tx.update(conversationMembersTable).set({ role: "owner" }).where(eq(conversationMembersTable.id, successor.id));
    }
    return tx.update(conversationMembersTable).set({ status: "left", leftAt: sql`now()` }).where(eq(conversationMembersTable.id, mine.id)).returning();
  });
  if (result === "owner") { res.status(409).json({ error: "Owner must transfer ownership before leaving" }); return; }
  if (!result) { res.status(404).json({ error: "Conversation not found" }); return; } res.json(Array.isArray(result) ? result[0] : result);
});
router.post("/conversations/:conversationId/close", async (req, res): Promise<void> => {
  const member = await memberFor(req); if (!member) { res.status(401).end(); return; }
  const result = await db.transaction(async (tx) => {
    const selected = (await tx.select({ groupId: conversationsTable.groupId }).from(conversationsTable).where(eq(conversationsTable.id, String(req.params.conversationId))).limit(1))[0];
    if (selected?.groupId) await lockGroupAuthority(tx, selected.groupId);
    const conversation = (await tx.select().from(conversationsTable).where(eq(conversationsTable.id, String(req.params.conversationId))).for("update"))[0];
    const mine = conversation && await activeMember(conversation.id, member.id, tx);
    if (!conversation || !mine || mine.role !== "owner") return undefined;
    await tx.update(conversationMembersTable).set({ status: "removed", removedAt: sql`now()` }).where(and(eq(conversationMembersTable.conversationId, conversation.id), eq(conversationMembersTable.status, "active")));
    return (await tx.update(conversationsTable).set({ status: "closed", closedAt: sql`now()` }).where(eq(conversationsTable.id, conversation.id)).returning())[0];
  });
  if (!result) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.json({ ...result, displayTitle: result.title ?? "Conversation", participantCount: 0, participants: [], lastMessage: null });
});

router.get("/conversations/:conversationId", async (req, res): Promise<void> => {
  const member = await memberFor(req); const conversation = member && await conversationView(String(req.params.conversationId), member.id);
  if (!conversation) { res.status(404).json({ error: "Conversation not found" }); return; }
  const members = await db.select().from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, conversation.id), eq(conversationMembersTable.status, "active")));
  const summary = await conversationSummary(conversation, member.id, conversation.myMembership);
  res.json({ ...summary, members: summary.participants });
});

router.get("/conversations/:conversationId/messages", async (req, res): Promise<void> => {
  const member = await memberFor(req); const conversation = member && await conversationView(String(req.params.conversationId), member.id);
  if (!conversation) { res.status(404).json({ error: "Conversation not found" }); return; }
  const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().optional() }).safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: "Invalid pagination" }); return; }
  const cursor = decode(q.data.cursor);
  if (q.data.cursor && !cursor) { res.status(400).json({ error: "Invalid cursor" }); return; }
  const rows = await db.select().from(messagesTable).where(and(eq(messagesTable.conversationId, conversation.id), gte(messagesTable.createdAt, conversation.myMembership.joinedAt), cursor ? or(gt(messagesTable.createdAt, cursor.at), and(eq(messagesTable.createdAt, cursor.at), gt(messagesTable.id, cursor.id))) : undefined)).orderBy(asc(messagesTable.createdAt), asc(messagesTable.id)).limit(q.data.limit + 1);
  const removed = rows.length ? await db.select({ messageId: messageMemberRemovalsTable.messageId }).from(messageMemberRemovalsTable).where(and(eq(messageMemberRemovalsTable.memberId, member.id), inArray(messageMemberRemovalsTable.messageId, rows.map((x) => x.id)))) : [];
  const removedIds = new Set(removed.map((x) => x.messageId));
  const visible = rows.filter((row) => !removedIds.has(row.id));
  const items = await Promise.all(visible.slice(0, q.data.limit).map((row) => decorateMessage(row, member.id)));
  res.json({ items, nextCursor: rows.length > q.data.limit && items.length ? encode(items.at(-1)!.createdAt, items.at(-1)!.id) : null });
});

router.post("/conversations/:conversationId/messages", memberRateLimit(60, 60_000, "message"), async (req, res): Promise<void> => {
  const member = await memberFor(req); const parsed = messageInput.safeParse(req.body);
  if (!member || !parsed.success) { res.status(400).json({ error: "Invalid message" }); return; }
  const result = await db.transaction(async (tx) => {
    const selected = (await tx.select({ groupId: conversationsTable.groupId }).from(conversationsTable).where(eq(conversationsTable.id, String(req.params.conversationId))).limit(1))[0];
    if (selected?.groupId) await lockGroupAuthority(tx, selected.groupId);
    const conversation = (await tx.select().from(conversationsTable).where(eq(conversationsTable.id, String(req.params.conversationId))).for("update"))[0];
    const membership = conversation && await activeMember(conversation.id, member.id, tx);
    if (!conversation || conversation.status !== "active" || !membership) return { error: "unavailable" as const };
    const participants = await tx.select({ memberId: conversationMembersTable.memberId }).from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, conversation.id), eq(conversationMembersTable.status, "active")));
    const liveParticipants = (await Promise.all(participants.map(async (participant) => await liveConversationMember(conversation.id, participant.memberId, tx) ? participant : undefined))).filter(Boolean) as typeof participants;
    if (participants.some((x) => x.memberId !== member.id && false)) return { error: "blocked" as const };
    for (const participant of liveParticipants) if (participant.memberId !== member.id && await blocked(member.id, participant.memberId, tx)) return { error: "blocked" as const };
    const existing = (await tx.select().from(messagesTable).where(and(eq(messagesTable.senderMemberId, member.id), eq(messagesTable.idempotencyKey, parsed.data.idempotencyKey))).limit(1))[0];
    if (existing) return { message: existing, participants: liveParticipants.map((x) => x.memberId) };
    if (!(await ownedReadyMedia(member.id, parsed.data.mediaAssetIds, tx))) return { error: "media" as const };
    const message = await insertMessage(conversation.id, member.id, parsed.data.body ?? null, parsed.data.mediaAssetIds, parsed.data.idempotencyKey, tx);
    await tx.update(conversationsTable).set({ updatedAt: sql`now()` }).where(eq(conversationsTable.id, conversation.id));
    return { message, participants: liveParticipants.map((x) => x.memberId) };
  });
  if ("error" in result) { res.status(result.error === "media" ? 409 : 404).json({ error: result.error === "media" ? "Media must be ready and owned" : "Conversation unavailable" }); return; }
  for (const recipientMemberId of result.participants.filter((id) => id !== member.id)) {
    await enqueueNotification({ recipientMemberId, actorMemberId: member.id, kind: "message", title: "New activity", body: "You have new activity", deepLink: "/messages", conversationId: String(req.params.conversationId), messageId: result.message.id, dedupKey: `message:${result.message.id}:${recipientMemberId}` });
  }
  res.status(201).json(await decorateMessage(result.message, member.id));
});

router.delete("/messages/:messageId/for-everyone", async (req, res): Promise<void> => {
  const member = await memberFor(req);
  if (!member) { res.status(401).end(); return; }
  const row = await db.transaction(async (tx) => {
    const selected = (await tx.select({ conversationId: messagesTable.conversationId }).from(messagesTable).where(and(eq(messagesTable.id, String(req.params.messageId)), eq(messagesTable.senderMemberId, member.id))).limit(1))[0];
    if (!selected) return undefined;
    const conversation = (await tx.select({ groupId: conversationsTable.groupId, status: conversationsTable.status }).from(conversationsTable).where(eq(conversationsTable.id, selected.conversationId)).limit(1))[0];
    if (conversation?.groupId) await lockGroupAuthority(tx, conversation.groupId);
    const message = (await tx.select().from(messagesTable).where(and(eq(messagesTable.id, String(req.params.messageId)), eq(messagesTable.senderMemberId, member.id))).for("update"))[0];
    if (!message || !conversation || conversation.status !== "active" || !(await activeMember(message.conversationId, member.id, tx))) return undefined;
    // Keep a non-empty database body to satisfy the legacy body/media check
    // constraint; all read serializers redact it when deletedForEveryoneAt is set.
    return (await tx.update(messagesTable).set({ body: "[deleted]", mediaAssetIds: [], status: "deleted_for_everyone", deletedForEveryoneAt: sql`now()` }).where(and(eq(messagesTable.id, message.id), eq(messagesTable.senderMemberId, member.id))).returning())[0];
  });
  if (!row) { res.status(404).json({ error: "Message not found" }); return; }
  await db.delete(messageMediaAttachmentsTable).where(eq(messageMediaAttachmentsTable.messageId, row.id));
  res.json(await decorateMessage(row, member.id));
});
router.delete("/messages/:messageId/for-me", async (req, res): Promise<void> => {
  const member = await memberFor(req);
  if (!member) { res.status(401).end(); return; }
  const message = await db.transaction(async (tx) => {
    const selected = (await tx.select().from(messagesTable).where(eq(messagesTable.id, String(req.params.messageId))).limit(1))[0];
    if (!selected) return undefined;
    const conversation = (await tx.select({ groupId: conversationsTable.groupId, status: conversationsTable.status }).from(conversationsTable).where(eq(conversationsTable.id, selected.conversationId)).limit(1))[0];
    if (conversation?.groupId) await lockGroupAuthority(tx, conversation.groupId);
    if (!conversation || conversation.status !== "active" || !(await activeMember(selected.conversationId, member.id, tx))) return undefined;
    await tx.insert(messageMemberRemovalsTable).values({ id: randomUUID(), messageId: selected.id, memberId: member.id }).onConflictDoNothing();
    return selected;
  });
  if (!message) { res.status(404).json({ error: "Message not found" }); return; }
  res.sendStatus(204);
});

router.post("/messages/:messageId/report", async (req, res): Promise<void> => {
  const member = await memberFor(req);
  const parsed = z.object({ category: z.enum(["harassment", "threats", "exploitation", "scams", "impersonation", "hateful_content", "dangerous_medical_claims", "distress_disclosure", "respectful_disagreement"]), details: z.string().max(5000).optional() }).strict().safeParse(req.body);
  if (!member || !parsed.success) { res.status(400).json({ error: "Invalid report" }); return; }
  const result = await db.transaction(async (tx) => {
    const selected = (await tx.select({ conversationId: messagesTable.conversationId }).from(messagesTable).where(eq(messagesTable.id, String(req.params.messageId))).limit(1))[0];
    const selectedConversation = selected && (await tx.select({ groupId: conversationsTable.groupId }).from(conversationsTable).where(eq(conversationsTable.id, selected.conversationId)).limit(1))[0];
    if (selectedConversation?.groupId) await lockGroupAuthority(tx, selectedConversation.groupId);
    const message = selected && (await tx.select().from(messagesTable).where(eq(messagesTable.id, String(req.params.messageId))).for("update"))[0];
    const reporterMembership = message && await activeMember(message.conversationId, member.id, tx);
    const participants = message ? await tx.select({ memberId: conversationMembersTable.memberId }).from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, message.conversationId), eq(conversationMembersTable.status, "active"))) : [];
    if (!message || message.deletedForEveryoneAt || !reporterMembership || await blocked(message.senderMemberId, member.id, tx)) return undefined;
    for (const participant of participants) if (participant.memberId !== member.id && await blocked(participant.memberId, member.id, tx)) return undefined;
    const [report] = await tx.insert(reportsTable).values({
      id: randomUUID(), reporterMemberId: member.id, targetMemberId: message.senderMemberId,
      contentTargetType: "message", contentId: message.id, category: parsed.data.category, details: parsed.data.details,
    }).returning();
    await tx.insert(moderationRecordsTable).values({ id: randomUUID(), reportId: report.id, contentId: message.id, subjectMemberId: message.senderMemberId, state: "pending" });
    const [evidence] = await tx.insert(messageReportsTable).values({
      id: randomUUID(), reportId: report.id, messageId: message.id, reporterMemberId: member.id,
      bodySnapshot: message.body, mediaAssetIdsSnapshot: message.mediaAssetIds, conversationIdSnapshot: message.conversationId,
    }).returning();
    const context = await tx.select().from(messagesTable).where(and(
      eq(messagesTable.conversationId, message.conversationId),
      gte(messagesTable.createdAt, reporterMembership.joinedAt),
      or(lt(messagesTable.createdAt, message.createdAt), and(eq(messagesTable.createdAt, message.createdAt), lt(messagesTable.id, message.id))),
    )).orderBy(desc(messagesTable.createdAt), desc(messagesTable.id)).limit(2);
    const following = await tx.select().from(messagesTable).where(and(
      eq(messagesTable.conversationId, message.conversationId),
      gte(messagesTable.createdAt, reporterMembership.joinedAt),
      or(gt(messagesTable.createdAt, message.createdAt), and(eq(messagesTable.createdAt, message.createdAt), gt(messagesTable.id, message.id))),
    )).orderBy(asc(messagesTable.createdAt), asc(messagesTable.id)).limit(2);
    const contextRows = [...context.reverse(), message, ...following];
    const removedContext = contextRows.length ? await tx.select({ messageId: messageMemberRemovalsTable.messageId }).from(messageMemberRemovalsTable).where(and(eq(messageMemberRemovalsTable.memberId, member.id), inArray(messageMemberRemovalsTable.messageId, contextRows.map((row) => row.id)))) : [];
    const removedContextIds = new Set(removedContext.map((row) => row.messageId));
    await tx.insert(messageReportContextTable).values(contextRows.filter((row) => !removedContextIds.has(row.id)).map((row, position) => ({
      id: randomUUID(), messageReportId: evidence.id, messageId: row.id, senderMemberId: row.senderMemberId,
      bodySnapshot: row.body, mediaAssetIdsSnapshot: row.mediaAssetIds, position,
    })));
    return { message, report, evidence };
  }).catch(() => undefined);
  if (!result) { res.status(404).json({ error: "Message unavailable" }); return; }
  res.status(201).json({ report: result.report, evidenceId: result.evidence.id, messageId: result.message.id });
});

export default router;