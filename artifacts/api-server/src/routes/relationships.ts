import { Router, type Request, type Response } from "express";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { db, membersTable, profilesTable, safetyRelationshipsTable, friendRequestsTable, friendshipsTable, followsTable, discoverySettingsTable, suggestionHidesTable, consentHistoryTable } from "@workspace/db";
import { requireAuth, memberRateLimit } from "../middlewares/account-auth";
import { visibleProfile } from "../lib/profile-policy";
import { z } from "zod";
import { allPermissions, interactionSchema, friendPermissionSchema, lockPrivacyUpdate, samePermissions } from "../lib/friend-permissions";
import "../lib/relationships-deletion-hook";

const router = Router();
router.use("/friends", requireAuth);
router.use("/follows", requireAuth);
router.use("/discovery", requireAuth);
router.use("/search", requireAuth, memberRateLimit(30, 60_000, "search"));
router.use("/account/settings", requireAuth);

async function own(req: Request) {
  const userId = getAuth(req).userId!;
  return (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, userId)).limit(1))[0];
}
function pair(a: string, b: string) { return a < b ? [a, b] as const : [b, a] as const; }
function encodeCursor(id: string): string { return Buffer.from(JSON.stringify({ id }), "utf8").toString("base64url"); }
function decodeCursor(value: string | undefined): string | undefined { if (!value) return undefined; try { const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); if (typeof parsed === "object" && parsed !== null && "id" in parsed && typeof parsed.id === "string") return parsed.id; } catch { /* invalid */ } return undefined; }
async function lockPair(tx: { execute: (query: unknown) => Promise<unknown> }, a: string, b: string): Promise<void> {
  const [left, right] = pair(a, b);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${left + ":" + right}, 0))`);
}
async function blockedIn(tx: { select: (...args: unknown[]) => any }, a: string, b: string): Promise<boolean> {
  return !!(await tx.select({ id: safetyRelationshipsTable.id }).from(safetyRelationshipsTable).where(and(
    eq(safetyRelationshipsTable.kind, "block"),
    or(and(eq(safetyRelationshipsTable.actorMemberId, a), eq(safetyRelationshipsTable.targetMemberId, b)), and(eq(safetyRelationshipsTable.actorMemberId, b), eq(safetyRelationshipsTable.targetMemberId, a))),
  )).limit(1))[0];
}
async function blocked(a: string, b: string) {
  return !!(await db.select({ id: safetyRelationshipsTable.id }).from(safetyRelationshipsTable).where(and(
    eq(safetyRelationshipsTable.kind, "block"),
    or(and(eq(safetyRelationshipsTable.actorMemberId, a), eq(safetyRelationshipsTable.targetMemberId, b)), and(eq(safetyRelationshipsTable.actorMemberId, b), eq(safetyRelationshipsTable.targetMemberId, a))),
  )).limit(1))[0];
}
async function target(id: string) { return (await db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.id, id)).limit(1))[0]; }
function invalid(_req: Request, res: Response, member: Awaited<ReturnType<typeof own>>, id: string): boolean {
  if (!member || !id || member.id === id) { res.status(400).json({ error: "Invalid target member" }); return true; }
  return false;
}

router.post("/friends/requests", memberRateLimit(20, 60_000, "friend-mutation"), async (req, res): Promise<void> => {
  const member = await own(req); const parsed = z.object({ targetMemberId: z.string().min(1).max(200) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid target member" }); return; }
  const id = parsed.data.targetMemberId;
  if (invalid(req, res, member, id) || !(await target(id))) return;
  if (await blocked(member.id, id)) { res.status(404).json({ error: "Member not found" }); return; }
  const settings = (await db.select().from(discoverySettingsTable).where(eq(discoverySettingsTable.memberId, id)).limit(1))[0];
  if (settings?.inboundFriendRequests === false) { res.status(403).json({ error: "Friend requests are disabled" }); return; }
  const [a, b] = pair(member.id, id);
  const result = await db.transaction(async (tx) => {
    await lockPair(tx, a, b);
    if (await blockedIn(tx, a, b)) return { kind: "blocked", row: null };
    const existingFriend = await tx.select().from(friendshipsTable).where(and(eq(friendshipsTable.memberAId, a), eq(friendshipsTable.memberBId, b))).limit(1);
    if (existingFriend[0]) return { kind: "friend", row: existingFriend[0] };
    const existing = await tx.select().from(friendRequestsTable).where(and(eq(friendRequestsTable.memberAId, a), eq(friendRequestsTable.memberBId, b), eq(friendRequestsTable.status, "pending"))).limit(1);
    if (existing[0]) return { kind: "exists", row: existing[0] };
    const [row] = await tx.insert(friendRequestsTable).values({ id: randomUUID(), requesterMemberId: member.id, recipientMemberId: id, memberAId: a, memberBId: b }).onConflictDoNothing().returning();
    return row ? { kind: "created", row } : { kind: "exists", row: null };
  });
  if (result.kind === "blocked") { res.status(404).json({ error: "Member not found" }); return; }
  if (result.kind === "friend") { res.status(409).json({ error: "Already friends", relationship: "friends" }); return; }
  if (result.kind !== "created") {
    const existing = result.row;
    if (existing && "requesterMemberId" in existing && existing.requesterMemberId !== member.id) {
      res.status(200).json({ status: "incoming_request", request: existing }); return;
    }
    res.status(409).json({ error: "Friend request already exists", relationship: "request_pending" }); return;
  }
  res.status(201).json({ status: "created", request: result.row });
});

async function requestAction(req: Request, res: Response, action: "accept" | "decline" | "cancel"): Promise<void> {
  const member = await own(req); const id = String(req.params.requestId);
  const request = (await db.select().from(friendRequestsTable).where(eq(friendRequestsTable.id, id)).limit(1))[0];
  if (!member || !request || (action === "cancel" ? request.requesterMemberId !== member.id : request.recipientMemberId !== member.id) || request.status !== "pending") { res.status(404).json({ error: "Friend request not found" }); return; }
  if (action === "cancel" || action === "decline") { await db.delete(friendRequestsTable).where(eq(friendRequestsTable.id, id)); res.sendStatus(204); return; }
  const review = z.object({ permissions: interactionSchema, expectedPermissions: interactionSchema }).strict().optional().safeParse(req.body);
  if (!review.success) { res.status(400).json({ error: "Invalid friend privacy choices" }); return; }
  const [a, b] = pair(request.requesterMemberId, request.recipientMemberId);
  const friendship = await db.transaction(async (tx) => {
    await lockPair(tx, a, b);
    if (await blockedIn(tx, a, b)) return null;
    // Always pair before privacy. Merge only this friend under the same lock
    // used by settings; never replace a stale, whole permission map.
    await lockPrivacyUpdate(tx, member.id);
    // Keep cancellation/decline from removing the request between this check
    // and the defaults write, even though those actions do not use pair locks.
    const [pending] = await tx.select().from(friendRequestsTable).where(and(eq(friendRequestsTable.id, id), eq(friendRequestsTable.status, "pending"))).limit(1).for("update");
    if (!pending) return null;
    if (review.data) {
      const [profile] = await tx.select().from(profilesTable).where(eq(profilesTable.memberId, member.id)).for("update");
      if (!profile) return { error: "Profile not found; request not accepted" };
      const current = profile.friendPermissions[request.requesterMemberId] ?? allPermissions;
      if (!samePermissions(current, review.data.expectedPermissions)) {
        return { error: "Friend settings changed elsewhere. Review the current choices before accepting." };
      }
      const merged = { ...profile.friendPermissions, [request.requesterMemberId]: review.data.permissions };
      if (!friendPermissionSchema.safeParse(merged).success) return { error: "Too many saved friend settings. Request not accepted." };
      await tx.update(profilesTable).set({ friendPermissions: merged }).where(eq(profilesTable.memberId, member.id));
      await tx.insert(consentHistoryTable).values({ id: randomUUID(), memberId: member.id, purpose: "profile_sharing", version: "friend-permissions", granted: profile.discoverable, scope: ["friend_permissions"] });
    }
    const [claimed] = await tx.delete(friendRequestsTable).where(and(eq(friendRequestsTable.id, id), eq(friendRequestsTable.recipientMemberId, member.id), eq(friendRequestsTable.status, "pending"))).returning();
    if (!claimed) return (await tx.select().from(friendshipsTable).where(and(eq(friendshipsTable.memberAId, a), eq(friendshipsTable.memberBId, b))).limit(1))[0] ?? null;
    const [created] = await tx.insert(friendshipsTable).values({ id: randomUUID(), memberAId: a, memberBId: b }).onConflictDoNothing().returning();
    return created ?? (await tx.select().from(friendshipsTable).where(and(eq(friendshipsTable.memberAId, a), eq(friendshipsTable.memberBId, b))).limit(1))[0];
  });
  if (!friendship) { res.status(409).json({ error: "Relationship is no longer available" }); return; }
  if ("error" in friendship) { res.status(409).json(friendship); return; }
  res.json(friendship);
}
router.post("/friends/requests/:requestId/accept", (req, res) => requestAction(req, res, "accept"));
router.post("/friends/requests/:requestId/decline", (req, res) => requestAction(req, res, "decline"));
router.delete("/friends/requests/:requestId", (req, res) => requestAction(req, res, "cancel"));

router.get("/friends/requests", async (req, res): Promise<void> => {
  const member = await own(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(50), cursor: z.string().max(200).optional() }).strict().safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid pagination" }); return; }
  const rows = await db.select().from(friendRequestsTable).where(and(
    eq(friendRequestsTable.status, "pending"),
    or(eq(friendRequestsTable.requesterMemberId, member.id), eq(friendRequestsTable.recipientMemberId, member.id)),
    decodeCursor(query.data.cursor) ? sql`${friendRequestsTable.id} > ${decodeCursor(query.data.cursor)}` : undefined,
  )).orderBy(asc(friendRequestsTable.id)).limit(query.data.limit + 1);
  const otherIds = rows.map((r) => r.requesterMemberId === member.id ? r.recipientMemberId : r.requesterMemberId);
  const profiles = otherIds.length ? await db.select().from(profilesTable).where(inArray(profilesTable.memberId, otherIds)) : [];
  const byId = new Map(profiles.map((p) => [p.memberId, { memberId: p.memberId, preferredName: visibleProfile(p, "member", member.id).preferredName ?? "Member" }]));
  const safeProfile = (memberId: string) => byId.get(memberId) ?? { memberId, preferredName: "Member" };
  const incoming = rows.slice(0, query.data.limit).filter((r) => r.recipientMemberId === member.id).map((r) => ({ ...r, profile: safeProfile(r.requesterMemberId) }));
  const outgoing = rows.slice(0, query.data.limit).filter((r) => r.requesterMemberId === member.id).map((r) => ({ ...r, profile: safeProfile(r.recipientMemberId) }));
  if (query.data.cursor && !decodeCursor(query.data.cursor)) { res.status(400).json({ error: "Invalid cursor" }); return; }
  res.json({ incoming, outgoing, nextCursor: rows.length > query.data.limit ? encodeCursor(rows[query.data.limit - 1].id) : null });
});

router.get("/friends", async (req, res): Promise<void> => {
  const member = await own(req); if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(50), cursor: z.string().max(200).optional() }).strict().safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid pagination" }); return; }
  const cursor = decodeCursor(query.data.cursor); if (query.data.cursor && !cursor) { res.status(400).json({ error: "Invalid cursor" }); return; }
  const rows = await db.select().from(friendshipsTable).where(and(or(eq(friendshipsTable.memberAId, member.id), eq(friendshipsTable.memberBId, member.id)), cursor ? sql`${friendshipsTable.id} > ${cursor}` : undefined)).orderBy(asc(friendshipsTable.id)).limit(query.data.limit + 1);
  const ids = rows.map((r) => r.memberAId === member.id ? r.memberBId : r.memberAId);
  const profiles = ids.length ? await db.select().from(profilesTable).where(inArray(profilesTable.memberId, ids)) : [];
  const names = new Map(profiles.map((p) => [p.memberId, visibleProfile(p, "connection", member.id).preferredName ?? "Member"]));
  const items = rows.slice(0, query.data.limit).map((r) => ({ id: r.id, memberId: r.memberAId === member.id ? r.memberBId : r.memberAId, preferredName: names.get(r.memberAId === member.id ? r.memberBId : r.memberAId) ?? "Member", direction: "mutual", status: "friends", createdAt: r.createdAt }));
  res.json({ items, nextCursor: rows.length > query.data.limit ? encodeCursor(items[items.length - 1].id) : null });
});
router.delete("/friends/:memberId", async (req, res): Promise<void> => {
  const member = await own(req); const id = String(req.params.memberId);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const [a, b] = pair(member.id, id); await db.transaction(async (tx) => { await lockPair(tx, a, b); await tx.delete(friendshipsTable).where(and(eq(friendshipsTable.memberAId, a), eq(friendshipsTable.memberBId, b))); }); res.sendStatus(204);
});

router.post("/follows/:memberId", memberRateLimit(30, 60_000, "follow-mutation"), async (req, res): Promise<void> => {
  const member = await own(req); const id = String(req.params.memberId);
  if (invalid(req, res, member, id) || !(await target(id))) return;
  if (await blocked(member.id, id)) { res.status(404).json({ error: "Member not found" }); return; }
  const settings = (await db.select().from(discoverySettingsTable).where(eq(discoverySettingsTable.memberId, id)).limit(1))[0];
  if (settings?.inboundFollows === false) { res.status(403).json({ error: "Follows are disabled" }); return; }
  const [row] = await db.transaction(async (tx) => { const [a, b] = pair(member.id, id); await lockPair(tx, a, b); if (await blockedIn(tx, a, b)) return []; return tx.insert(followsTable).values({ id: randomUUID(), followerMemberId: member.id, followedMemberId: id }).onConflictDoNothing().returning(); });
  if (!row) { res.status(409).json({ error: "Already following" }); return; } res.status(201).json(row);
});
router.delete("/follows/:memberId", async (req, res): Promise<void> => { const m = await own(req); if (!m) { res.status(401).end(); return; } await db.transaction(async (tx) => { await lockPair(tx, m.id, String(req.params.memberId)); await tx.delete(followsTable).where(and(eq(followsTable.followerMemberId, m.id), eq(followsTable.followedMemberId, String(req.params.memberId)))); }); res.sendStatus(204); });
router.get("/follows", async (req, res): Promise<void> => {
  const m = await own(req); if (!m) { res.status(404).json({ error: "Onboarding required" }); return; }
  const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(50), cursor: z.string().max(200).optional() }).strict().safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid pagination" }); return; }
  const cursor = decodeCursor(query.data.cursor);
  if (query.data.cursor && !cursor) { res.status(400).json({ error: "Invalid cursor" }); return; }
  const rows = await db.select().from(followsTable).where(and(or(eq(followsTable.followerMemberId, m.id), eq(followsTable.followedMemberId, m.id)), cursor ? sql`${followsTable.id} > ${cursor}` : undefined)).orderBy(asc(followsTable.id)).limit(query.data.limit + 1);
  const ids = rows.map((r) => r.followerMemberId === m.id ? r.followedMemberId : r.followerMemberId);
  const profiles = ids.length ? await db.select().from(profilesTable).where(inArray(profilesTable.memberId, ids)) : [];
  const connections = await db.select().from(friendshipsTable).where(or(eq(friendshipsTable.memberAId, m.id), eq(friendshipsTable.memberBId, m.id)));
  const friends = new Set(connections.map((r) => r.memberAId === m.id ? r.memberBId : r.memberAId));
  const names = new Map(profiles.map((p) => [p.memberId, visibleProfile(p, friends.has(p.memberId) ? "connection" : "member", m.id).preferredName ?? "Member"]));
  const items = rows.slice(0, query.data.limit).map((r) => {
    const outgoing = r.followerMemberId === m.id; const id = outgoing ? r.followedMemberId : r.followerMemberId;
    return { id: r.id, memberId: id, preferredName: names.get(id) ?? "Member", direction: outgoing ? "outgoing" : "incoming", status: "following", createdAt: r.createdAt };
  });
  res.json({ items, nextCursor: rows.length > query.data.limit ? encodeCursor(items[items.length - 1].id) : null });
});

router.patch("/account/settings", async (req, res): Promise<void> => {
  const m = await own(req); if (!m) { res.status(404).json({ error: "Onboarding required" }); return; }
  const body = req.body ?? {}; const keys = ["inboundFriendRequests", "inboundFollows", "suggestionsEnabled"];
  if (Object.keys(body).some((k) => !keys.includes(k) || typeof body[k] !== "boolean")) { res.status(400).json({ error: "Invalid account settings" }); return; }
  const [row] = await db.insert(discoverySettingsTable).values({ memberId: m.id, ...body }).onConflictDoUpdate({ target: discoverySettingsTable.memberId, set: body }).returning(); res.json(row);
});
router.get("/account/settings", async (req, res): Promise<void> => { const m = await own(req); if (!m) { res.status(404).json({ error: "Onboarding required" }); return; } const [row] = await db.select().from(discoverySettingsTable).where(eq(discoverySettingsTable.memberId, m.id)).limit(1); res.json(row ?? { memberId: m.id, inboundFriendRequests: true, inboundFollows: true, suggestionsEnabled: false }); });

router.get("/search", async (req, res): Promise<void> => {
  const m = await own(req); if (!m) { res.status(404).json({ error: "Onboarding required" }); return; }
  const parsed = z.object({ q: z.string().trim().min(2).max(100), limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().max(200).optional() }).strict().safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid search or cursor" }); return; }
  const q = parsed.data.q; const limit = parsed.data.limit;
  let cursor = ""; if (parsed.data.cursor) { try { const decoded = Buffer.from(parsed.data.cursor, "base64url").toString("utf8"); if (!/^[^:]{1,200}$/.test(decoded)) throw new Error(); cursor = decoded; } catch { res.status(400).json({ error: "Invalid cursor" }); return; } }
  const blockedIds = await db.select({ id: sql<string>`case when ${safetyRelationshipsTable.actorMemberId} = ${m.id} then ${safetyRelationshipsTable.targetMemberId} else ${safetyRelationshipsTable.actorMemberId} end` }).from(safetyRelationshipsTable).where(and(eq(safetyRelationshipsTable.kind, "block"), or(eq(safetyRelationshipsTable.actorMemberId, m.id), eq(safetyRelationshipsTable.targetMemberId, m.id))));
  const excluded = [m.id, ...blockedIds.map((x) => x.id)];
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db.select().from(profilesTable).where(and(eq(profilesTable.discoverable, true), sql`${profilesTable.visibility}->>'preferredName' = 'members'`, sql`${profilesTable.preferredName} ilike ${pattern} escape '\\'`, excluded.length ? sql`${profilesTable.memberId} not in (${sql.join(excluded.map((x) => sql`${x}`), sql`,`)})` : undefined, cursor ? sql`${profilesTable.memberId} > ${cursor}` : undefined)).orderBy(asc(profilesTable.memberId)).limit(limit + 1);
  const friendshipRows = await db.select().from(friendshipsTable).where(or(eq(friendshipsTable.memberAId, m.id), eq(friendshipsTable.memberBId, m.id)));
  const friends = new Set(friendshipRows.map((r) => r.memberAId === m.id ? r.memberBId : r.memberAId));
  const requestRows = await db.select().from(friendRequestsTable).where(and(eq(friendRequestsTable.status, "pending"), or(eq(friendRequestsTable.requesterMemberId, m.id), eq(friendRequestsTable.recipientMemberId, m.id))));
  const followRows = await db.select().from(followsTable).where(or(eq(followsTable.followerMemberId, m.id), eq(followsTable.followedMemberId, m.id)));
  const items = rows.slice(0, limit).filter((profile) => visibleProfile(profile, friends.has(profile.memberId) ? "connection" : "member", m.id).preferredName !== undefined).map((profile) => {
    const safe = visibleProfile(profile, friends.has(profile.memberId) ? "connection" : "member", m.id);
    delete safe.photoPath;
    const request = requestRows.find((r) => r.requesterMemberId === profile.memberId || r.recipientMemberId === profile.memberId);
    return {
      memberId: profile.memberId,
      profile: safe,
      relationship: friends.has(profile.memberId) ? "friends" : "none",
      request: request ? (request.requesterMemberId === m.id ? "outgoing" : "incoming") : "none",
      pendingRequestId: request?.id ?? null,
      isFollowing: followRows.some((r) => r.followerMemberId === m.id && r.followedMemberId === profile.memberId),
    };
  });
  const last = items[items.length - 1];
  res.json({ items, nextCursor: rows.length > limit && last ? Buffer.from(String(rows[limit - 1].memberId)).toString("base64url") : null });
});

router.get("/discovery/suggestions", async (req, res): Promise<void> => {
  const m = await own(req); if (!m) { res.status(404).json({ error: "Onboarding required" }); return; }
  const settings = (await db.select().from(discoverySettingsTable).where(eq(discoverySettingsTable.memberId, m.id)).limit(1))[0];
  if (!settings?.suggestionsEnabled) { res.json([]); return; }
  const me = (await db.select().from(profilesTable).where(eq(profilesTable.memberId, m.id)).limit(1))[0]; if (!me) { res.json([]); return; }
  const hidden = await db.select({ id: suggestionHidesTable.suggestedMemberId }).from(suggestionHidesTable).where(eq(suggestionHidesTable.memberId, m.id));
  const blockedRows = await db.select({ actor: safetyRelationshipsTable.actorMemberId, target: safetyRelationshipsTable.targetMemberId }).from(safetyRelationshipsTable).where(and(eq(safetyRelationshipsTable.kind, "block"), or(eq(safetyRelationshipsTable.actorMemberId, m.id), eq(safetyRelationshipsTable.targetMemberId, m.id))));
  const excluded = new Set([m.id, ...hidden.map((x) => x.id), ...blockedRows.map((x) => x.actor === m.id ? x.target : x.actor)]);
  const friendRows = await db.select().from(friendshipsTable).where(or(eq(friendshipsTable.memberAId, m.id), eq(friendshipsTable.memberBId, m.id)));
  friendRows.forEach((r) => excluded.add(r.memberAId === m.id ? r.memberBId : r.memberAId));
  const requestRows = await db.select().from(friendRequestsTable).where(and(eq(friendRequestsTable.status, "pending"), or(eq(friendRequestsTable.requesterMemberId, m.id), eq(friendRequestsTable.recipientMemberId, m.id))));
  requestRows.forEach((r) => excluded.add(r.requesterMemberId === m.id ? r.recipientMemberId : r.requesterMemberId));
  const followRows = await db.select().from(followsTable).where(or(eq(followsTable.followerMemberId, m.id), eq(followsTable.followedMemberId, m.id)));
  followRows.forEach((r) => excluded.add(r.followerMemberId === m.id ? r.followedMemberId : r.followerMemberId));
  const rows = await db.select().from(profilesTable).where(and(eq(profilesTable.discoverable, true), sql`${profilesTable.visibility}->>'preferredName' = 'members'`)).limit(200);
  const ranked = rows.filter((r) => !excluded.has(r.memberId) && visibleProfile(r, "member", m.id).preferredName !== undefined).map((r) => {
    const visible = visibleProfile(r, "member", m.id);
    const targetInterestsVisible = visible.interests !== undefined;
    const targetLanguageVisible = visible.language !== undefined;
    const targetRegionVisible = visible.broadRegion !== undefined;
    const shared = targetInterestsVisible ? (me.interests ?? []).filter((interest) => (r.interests ?? []).includes(interest)) : [];
    const sameLanguage = targetLanguageVisible && !!me.language && me.language === r.language;
    const sameRegion = targetRegionVisible && !!me.broadRegion && me.broadRegion === r.broadRegion;
    const score = shared.length * 3 + (sameLanguage ? 2 : 0) + (sameRegion ? 1 : 0);
    const reasons = [sameLanguage ? "shared language" : "", sameRegion ? "shared broad region" : "", shared.length ? `${shared.length} shared interests` : ""].filter(Boolean);
    return { memberId: r.memberId, preferredName: r.preferredName, score, explanation: reasons.join(", ") };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.memberId.localeCompare(b.memberId)).slice(0, 20);
  res.json(ranked.map(({ score: _score, ...r }) => r));
});
router.post("/discovery/suggestions/:memberId/hide", async (req, res): Promise<void> => { const m = await own(req); if (!m) { res.status(404).end(); return; } await db.insert(suggestionHidesTable).values({ id: randomUUID(), memberId: m.id, suggestedMemberId: String(req.params.memberId) }).onConflictDoNothing(); res.sendStatus(204); });

export default router;