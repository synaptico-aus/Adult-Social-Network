import { Router, type Request } from "express";
import { and, asc, desc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { circleHistoryGrantsTable, circleMembersTable, circlesTable, db, commentsTable, friendshipsTable, membersTable, mediaAssetsTable, moderationRecordsTable, notificationEventsTable, postHidesTable, postReactionsTable, postSavesTable, postsTable, profilesTable, safetyRelationshipsTable, groupMembersTable, groupsTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { requireAuth, memberRateLimit } from "../middlewares/account-auth";
import { intakeForModeration } from "../lib/moderation-intake";
import "../lib/posts-deletion-hook";
import { activeGroupMembership as liveActiveGroupMembership, canUseGroup as liveCanUseGroup, canViewGroupPost as liveCanViewGroupPost } from "../lib/group-access";
import { videoPublicFields } from "../lib/media-response";
import { cleanupDetachedVideoAssets } from "../lib/media-deletion-hook";

const router = Router();
router.use(["/posts", "/feed", "/reels"], requireAuth);
// External sharing is a normal authenticated deep link, never a bearer grant.
// Keep private bodies/media out of cacheable crawler/link-preview responses.
router.use("/posts/:id", (_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  res.set("X-Robots-Tag", "noindex, noarchive");
  next();
});
const postInput = z.object({ body: z.string().max(20000), audience: z.enum(["only_me", "friends", "my_circle", "this_group", "public"]).optional(), circleId: z.string().min(1).max(200).nullable().optional(), groupId: z.string().min(1).max(200).nullable().optional(), isIntroduction: z.boolean().optional(), responseLabel: z.enum(["someone_to_listen", "shared_experiences", "practical_ideas", "something_uplifting"]).nullable().optional(), commentsOpen: z.boolean().optional(), visibleReactionCounts: z.boolean().optional(), originalPostId: z.string().optional(), commentary: z.string().max(10000).optional(), mediaAssetIds: z.array(z.string()).max(10).optional() }).strict();
async function ownedReadyMedia(memberId: string, ids: string[] | undefined, source: QuerySource = db) {
  if (!ids?.length) return true;
  const assets = await source.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.ownerMemberId, memberId), inArray(mediaAssetsTable.id, ids)));
  return assets.length === ids.length && assets.every((a: { status: string }) => a.status === "ready");
}
const commentInput = z.object({ body: z.string().max(10000), parentCommentId: z.string().nullable().optional() }).strict();
type QuerySource = { select: (...args: any[]) => any };
const pair = (a: string, b: string) => a < b ? [a, b] as const : [b, a] as const;
// Authorization lock order: canonical member pair advisory lock first, then post row lock.
async function lockPair(tx: { execute: (q: unknown) => Promise<unknown> }, a: string, b: string) {
  const [left, right] = pair(a, b);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${left + ":" + right}, 0))`);
}
async function member(req: Request) {
  const id = getAuth(req).userId;
  if (!id) return undefined;
  return (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, id)).limit(1))[0];
}
function cursor(v: unknown): { at: Date; id: string } | undefined {
  if (typeof v !== "string") return undefined;
  try { const x = JSON.parse(Buffer.from(v, "base64url").toString("utf8")); if (typeof x.id === "string" && typeof x.at === "string") return { at: new Date(x.at), id: x.id }; } catch { /* invalid */ }
  return undefined;
}
function encodeCursor(row: { createdAt: Date; id: string }) { return Buffer.from(JSON.stringify({ at: row.createdAt.toISOString(), id: row.id }), "utf8").toString("base64url"); }
async function blocked(a: string, b: string, source: QuerySource = db) {
  return !!(await source.select({ id: safetyRelationshipsTable.id }).from(safetyRelationshipsTable).where(and(
    eq(safetyRelationshipsTable.kind, "block"),
    or(
      and(eq(safetyRelationshipsTable.actorMemberId, a), eq(safetyRelationshipsTable.targetMemberId, b)),
      and(eq(safetyRelationshipsTable.actorMemberId, b), eq(safetyRelationshipsTable.targetMemberId, a)),
    ),
  )).limit(1))[0];
}
async function friendship(a: string, b: string, source: QuerySource = db) {
  const [x, y] = pair(a, b);
  return !!(await source.select({ id: friendshipsTable.id }).from(friendshipsTable).where(and(eq(friendshipsTable.memberAId, x), eq(friendshipsTable.memberBId, y))).limit(1))[0];
}
async function activeCircleMembership(circleId: string, memberId: string, source: QuerySource = db) {
  return (await source.select().from(circleMembersTable).where(and(eq(circleMembersTable.circleId, circleId), eq(circleMembersTable.memberId, memberId), eq(circleMembersTable.status, "active"))).limit(1))[0];
}
async function canUseCircle(circleId: string | null | undefined, memberId: string, source: QuerySource = db) {
  if (!circleId) return false;
  const [circle, membership] = await Promise.all([
    source.select().from(circlesTable).where(and(eq(circlesTable.id, circleId), eq(circlesTable.status, "active"))).limit(1),
    activeCircleMembership(circleId, memberId, source),
  ]);
  return !!circle[0] && !!membership;
}
async function activeGroupMembership(groupId: string, memberId: string, source: QuerySource = db) {
  return liveActiveGroupMembership(groupId, memberId, source);
}
async function canUseGroup(groupId: string | null | undefined, memberId: string, source: QuerySource = db) {
  return liveCanUseGroup(groupId, memberId, source);
}
async function canViewGroupPost(post: typeof postsTable.$inferSelect, viewer: string, source: QuerySource = db) {
  return liveCanViewGroupPost(post, viewer, source);
}
async function canViewCirclePost(post: typeof postsTable.$inferSelect, viewer: string, source: QuerySource = db) {
  if (!post.circleId || !(await canUseCircle(post.circleId, viewer, source))) return false;
  const membership = await activeCircleMembership(post.circleId, viewer, source);
  if (!membership) return false;
  const postTime = post.publishedAt ?? post.createdAt;
  if (postTime >= membership.joinedAt) return true;
  return !!(await source.select({ id: circleHistoryGrantsTable.id }).from(circleHistoryGrantsTable).where(and(eq(circleHistoryGrantsTable.circleId, post.circleId), eq(circleHistoryGrantsTable.memberId, viewer), eq(circleHistoryGrantsTable.status, "active"))).limit(1))[0];
}
export async function visiblePost(post: typeof postsTable.$inferSelect, viewer: string, source: QuerySource = db) {
  if (post.groupId) {
    const group = (await source.select().from(groupsTable).where(and(eq(groupsTable.id, post.groupId), eq(groupsTable.status, "active"))).limit(1))[0];
    if (!group || !(await activeGroupMembership(group.id, post.authorMemberId, source))) return false;
  }
  if (post.status !== "published") return post.authorMemberId === viewer && post.status !== "deleted";
  if (post.originalPostId) {
    const original = (await source.select().from(postsTable).where(eq(postsTable.id, post.originalPostId)).limit(1))[0];
    if (!original || original.status === "deleted" || !(await visiblePost(original, viewer, source))) return false;
  }
  const moderation = (await source.select({ state: moderationRecordsTable.state }).from(moderationRecordsTable)
    .where(and(eq(moderationRecordsTable.contentId, post.id), ne(moderationRecordsTable.state, "pending"))).orderBy(desc(moderationRecordsTable.createdAt)).limit(1))[0];
  if (moderation && ["held", "removed", "appealed"].includes(moderation.state) && post.authorMemberId !== viewer) return false;
  if (await blocked(post.authorMemberId, viewer, source)) return false;
  if (post.audience === "my_circle") return canViewCirclePost(post, viewer, source);
  if (post.audience === "this_group") return canViewGroupPost(post, viewer, source);
  if (post.authorMemberId === viewer || post.audience === "public") return true;
  if (post.audience === "friends") return friendship(post.authorMemberId, viewer, source);
  return false;
}
async function hidden(postId: string, viewer: string, source: QuerySource = db) {
  return !!(await source.select({ id: postHidesTable.id }).from(postHidesTable).where(and(eq(postHidesTable.postId, postId), eq(postHidesTable.memberId, viewer))).limit(1))[0];
}
async function mediaAttachments(post: typeof postsTable.$inferSelect, viewer: string) {
  if (!post.mediaAssetIds?.length) return [];
  const assets = await db.select().from(mediaAssetsTable).where(inArray(mediaAssetsTable.id, post.mediaAssetIds));
  return assets.filter((asset) => asset.status === "ready" || post.authorMemberId === viewer).map((asset) => ({
    id: asset.id, kind: asset.kind, contentType: asset.contentType, byteSize: asset.byteSize, width: asset.width,
    height: asset.height, durationSeconds: asset.durationSeconds, status: asset.status, altText: asset.altText,
    malwareState: asset.malwareState, abuseState: asset.abuseState, transcript: asset.transcript,
    ...videoPublicFields(asset),
    limitation: asset.status === "held" || asset.status === "rejected" ? (asset.rejectionReason ?? "Media checks are pending") : null,
  }));
}
export async function response(post: typeof postsTable.$inferSelect, viewer: string) {
  if (!await visiblePost(post, viewer) || await hidden(post.id, viewer)) return undefined;
  const counts = post.authorMemberId === viewer || post.visibleReactionCounts;
  const rows = counts ? await db.select({ kind: postReactionsTable.kind, count: sql<number>`count(*)` }).from(postReactionsTable).where(eq(postReactionsTable.postId, post.id)).groupBy(postReactionsTable.kind) : [];
  const mine = await db.select({ kind: postReactionsTable.kind }).from(postReactionsTable).where(and(eq(postReactionsTable.postId, post.id), eq(postReactionsTable.memberId, viewer)));
  const saved = !!(await db.select({ id: postSavesTable.id }).from(postSavesTable).where(and(eq(postSavesTable.postId, post.id), eq(postSavesTable.memberId, viewer))).limit(1))[0];
  const profile = (await db.select({ preferredName: profilesTable.preferredName }).from(profilesTable).where(eq(profilesTable.memberId, post.authorMemberId)).limit(1))[0];
  return { ...post, body: post.status === "deleted" ? null : post.body, authorId: post.authorMemberId, authorDisplayName: profile?.preferredName ?? "Member", myReactions: mine.map((x) => x.kind), saved, reactionCounts: counts ? Object.fromEntries(rows.map((r) => [r.kind, Number(r.count)])) : null, originalAvailable: !post.originalPostId || true, mediaAssets: await mediaAttachments(post, viewer) };
}
router.post("/posts", memberRateLimit(30, 60_000, "post-mutation"), async (req, res): Promise<void> => {
  const m = await member(req); const p = postInput.safeParse(req.body);
  if (!m || !p.success) { res.status(400).json({ error: "Invalid post" }); return; }
  if (!(await ownedReadyMedia(m.id, p.data.mediaAssetIds))) { res.status(409).json({ error: "All attached media must be ready" }); return; }
  if (p.data.audience === "my_circle" && !(await canUseCircle(p.data.circleId, m.id))) { res.status(404).json({ error: "Circle not found" }); return; }
  if (p.data.audience === "this_group" && !(await canUseGroup(p.data.groupId, m.id))) { res.status(404).json({ error: "Group not found" }); return; }
  if (p.data.audience !== "my_circle" && p.data.circleId) { res.status(400).json({ error: "A circle can only be used with a circle post" }); return; }
  if (p.data.audience !== "this_group" && p.data.groupId) { res.status(400).json({ error: "A group can only be used with a group post" }); return; }
  let original: typeof postsTable.$inferSelect | undefined;
  if (p.data.originalPostId) {
    original = (await db.select().from(postsTable).where(eq(postsTable.id, p.data.originalPostId)).limit(1))[0];
    if (!original || !(await visiblePost(original, m.id))) { res.status(404).json({ error: "Original post is unavailable" }); return; }
    if (original.audience === "my_circle" || p.data.audience === "my_circle" || original.audience === "this_group" || p.data.audience === "this_group") { res.status(400).json({ error: "Group and circle posts cannot be reshared outside their space" }); return; }
    const rank = { only_me: 0, friends: 1, public: 2 } as const;
    if (rank[p.data.audience ?? "only_me"] > rank[original.audience as keyof typeof rank]) { res.status(400).json({ error: "Share audience cannot widen the original audience" }); return; }
  }
  const [row] = await db.transaction(async (tx) => {
     if (!(await ownedReadyMedia(m.id, p.data.mediaAssetIds, tx))) return [];
    if (original && original.authorMemberId !== m.id) await lockPair(tx, m.id, original.authorMemberId);
    if (original) {
      const [live] = await tx.select().from(postsTable).where(eq(postsTable.id, original.id)).for("update");
      if (!live || !(await visiblePost(live, m.id, tx))) throw new Error("Original post is unavailable");
      const seen = new Set<string>(); let cursorId: string | null = live.id;
      for (let depth = 0; cursorId && depth < 100; depth++) {
        if (seen.has(cursorId)) throw new Error("Original post chain is cyclic");
        seen.add(cursorId);
        const [ancestor] = await tx.select({ originalPostId: postsTable.originalPostId }).from(postsTable).where(eq(postsTable.id, cursorId)).limit(1);
        cursorId = ancestor?.originalPostId ?? null;
      }
      if (cursorId) throw new Error("Original post chain is too deep");
      if (live.audience === "my_circle" || p.data.audience === "my_circle" || live.audience === "this_group" || p.data.audience === "this_group") throw new Error("Share audience cannot widen the original audience");
      const rank = { only_me: 0, friends: 1, public: 2 } as const;
      if (rank[p.data.audience ?? "only_me"] > rank[live.audience as keyof typeof rank]) throw new Error("Share audience cannot widen the original audience");
    }
    if (p.data.audience === "my_circle" && !(await canUseCircle(p.data.circleId, m.id, tx))) return [];
    if (p.data.audience === "this_group" && !(await canUseGroup(p.data.groupId, m.id, tx))) return [];
     return tx.insert(postsTable).values({ id: randomUUID(), authorMemberId: m.id, body: p.data.body, audience: p.data.audience ?? "only_me", circleId: p.data.circleId ?? null, groupId: p.data.groupId ?? null, isIntroduction: p.data.isIntroduction ?? false, responseLabel: p.data.responseLabel, commentsOpen: p.data.commentsOpen ?? true, visibleReactionCounts: p.data.visibleReactionCounts ?? true, originalPostId: p.data.originalPostId, commentary: p.data.commentary, mediaAssetIds: p.data.mediaAssetIds ?? [] }).returning();
  }).catch((error: unknown) => {
    if (error instanceof Error && /unavailable|cyclic|too deep/.test(error.message)) return [] as typeof postsTable.$inferSelect[];
    throw error;
  });
  if (!row) { res.status(404).json({ error: "Original post is unavailable" }); return; }
  res.status(201).json(await response(row, m.id));
});

router.get("/posts/:id", async (req, res): Promise<void> => {
  const m = await member(req);
  const post = (await db.select().from(postsTable).where(eq(postsTable.id, String(req.params.id))).limit(1))[0];
  if (!m || !post || !(await visiblePost(post, m.id))) { res.status(404).json({ error: "Post not found" }); return; }
  res.json(await response(post, m.id));
});
router.get("/posts", async (req, res): Promise<void> => {
  const m = await member(req); if (!m) { res.status(401).end(); return; }
  const q = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().optional(), authorMemberId: z.string().optional() }).safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: "Invalid pagination" }); return; }
  const c = q.data.cursor ? cursor(q.data.cursor) : undefined; if (q.data.cursor && !c) { res.status(400).json({ error: "Invalid cursor" }); return; }
  const items: NonNullable<Awaited<ReturnType<typeof response>>>[] = []; let scan = c; let exhausted = false;
  while (items.length <= q.data.limit && !exhausted) {
    const rows = await db.select().from(postsTable).where(and(q.data.authorMemberId ? eq(postsTable.authorMemberId, q.data.authorMemberId) : eq(postsTable.authorMemberId, m.id), scan ? or(lt(postsTable.createdAt, scan.at), and(eq(postsTable.createdAt, scan.at), lt(postsTable.id, scan.id))) : undefined)).orderBy(desc(postsTable.createdAt), desc(postsTable.id)).limit(200);
    if (!rows.length) break;
    for (const row of rows) { const item = await response(row, m.id); if (item) items.push(item); if (items.length > q.data.limit) break; }
    scan = { at: rows.at(-1)!.createdAt, id: rows.at(-1)!.id }; exhausted = rows.length < 200;
  }
  const page = items.slice(0, q.data.limit);
  res.json({ items: page, nextCursor: items.length > q.data.limit && page.at(-1) ? encodeCursor(page.at(-1)!) : null });
});
router.get("/posts/:id", async (req, res): Promise<void> => {
  const m = await member(req); const post = (await db.select().from(postsTable).where(eq(postsTable.id, String(req.params.id))).limit(1))[0];
  if (!m || !post) { res.status(404).json({ error: "Post not found" }); return; }
  const item = await response(post, m.id); if (!item) { res.status(404).json({ error: "Post not found" }); return; }
  res.json(item);
});
router.get("/feed", async (req, res): Promise<void> => {
  const m = await member(req); if (!m) { res.status(401).end(); return; }
  const q = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().optional(), filter: z.enum(["all", "friends"]).default("all") }).safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: "Invalid feed query" }); return; }
  const c = q.data.cursor ? cursor(q.data.cursor) : undefined; if (q.data.cursor && !c) { res.status(400).json({ error: "Invalid cursor" }); return; }
  const filtered: NonNullable<Awaited<ReturnType<typeof response>>>[] = [];
  let scan = c; let exhausted = false;
  while (filtered.length <= q.data.limit && !exhausted) {
    const rows = await db.select().from(postsTable).where(and(eq(postsTable.status, "published"), scan ? or(lt(postsTable.createdAt, scan.at), and(eq(postsTable.createdAt, scan.at), lt(postsTable.id, scan.id))) : undefined)).orderBy(desc(postsTable.createdAt), desc(postsTable.id)).limit(200);
    if (!rows.length) break;
    for (const x of rows) {
      if (q.data.filter === "friends" && x.authorMemberId !== m.id && !(await friendship(x.authorMemberId, m.id))) continue;
      const item = await response(x, m.id); if (item) filtered.push(item);
      if (filtered.length > q.data.limit) break;
    }
    scan = { at: rows.at(-1)!.createdAt, id: rows.at(-1)!.id }; exhausted = rows.length < 200;
  }
  const items = filtered.slice(0, q.data.limit); const last = items.at(-1);
  res.json({ items, nextCursor: filtered.length > q.data.limit && last ? encodeCursor(last) : null });
});
router.get("/reels", async (req, res): Promise<void> => {
  const m = await member(req);
  if (!m) { res.status(401).end(); return; }
  const c = req.query.cursor ? cursor(req.query.cursor) : undefined;
  if (req.query.cursor && (!c || !Number.isFinite(c.at.getTime()))) { res.status(400).json({ error: "Invalid reel cursor" }); return; }
  const items: NonNullable<Awaited<ReturnType<typeof response>>>[] = [];
  let scan = c, exhausted = false;
  for (let batches = 0; batches < 5 && items.length < 11 && !exhausted; batches++) {
    const rows = await db.select().from(postsTable).where(and(eq(postsTable.status, "published"),
      sql`exists (select 1 from media_assets ma where ma.id in (select jsonb_array_elements_text(${postsTable.mediaAssetIds})) and ma.kind = 'video' and ma.video_format = 'reel' and ma.status = 'ready')`,
      scan ? or(lt(postsTable.createdAt, scan.at), and(eq(postsTable.createdAt, scan.at), lt(postsTable.id, scan.id))) : undefined))
      .orderBy(desc(postsTable.createdAt), desc(postsTable.id)).limit(100);
    if (!rows.length) { exhausted = true; break; }
    for (const row of rows) {
      scan = { at: row.createdAt, id: row.id };
      const item = await response(row, m.id);
      if (item) items.push(item);
      if (items.length >= 11) break;
    }
    exhausted = rows.length < 100 && items.length < 11;
  }
  const shown = items.slice(0, 10), last = shown.at(-1);
  res.set("Cache-Control", "private, no-store").json({ items: shown,
    nextCursor: items.length > 10 && last ? encodeCursor(last) : !exhausted && scan ? encodeCursor({ createdAt: scan.at, id: scan.id }) : null });
});
router.get("/saved", async (req, res): Promise<void> => {
  const m = await member(req); if (!m) { res.status(401).end(); return; }
  const q = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().optional() }).safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: "Invalid pagination" }); return; }
  const c = q.data.cursor ? cursor(q.data.cursor) : undefined; if (q.data.cursor && !c) { res.status(400).json({ error: "Invalid cursor" }); return; }
  const accepted: { post: typeof postsTable.$inferSelect; saveRow: typeof postSavesTable.$inferSelect }[] = []; let scan = c; let exhausted = false;
  while (accepted.length <= q.data.limit && !exhausted) {
    const rows = await db.select({ save: postSavesTable, post: postsTable }).from(postSavesTable).innerJoin(postsTable, eq(postsTable.id, postSavesTable.postId)).where(and(eq(postSavesTable.memberId, m.id), scan ? or(lt(postSavesTable.createdAt, scan.at), and(eq(postSavesTable.createdAt, scan.at), lt(postSavesTable.id, scan.id))) : undefined)).orderBy(desc(postSavesTable.createdAt), desc(postSavesTable.id)).limit(200);
    if (!rows.length) break;
    for (const row of rows) { const item = await response(row.post, m.id); if (item) accepted.push({ post: row.post, saveRow: row.save }); if (accepted.length > q.data.limit) break; }
    scan = { at: rows.at(-1)!.save.createdAt, id: rows.at(-1)!.save.id }; exhausted = rows.length < 200;
  }
  const returnedPairs = accepted.slice(0, q.data.limit);
  const page = await Promise.all(returnedPairs.map((pair) => response(pair.post, m.id)));
  res.json({ items: page.filter(Boolean), nextCursor: accepted.length > q.data.limit ? encodeCursor(returnedPairs.at(-1)!.saveRow) : null });
});
router.patch("/posts/:id", memberRateLimit(30, 60_000, "post-mutation"), async (req, res): Promise<void> => {
  const m = await member(req); const p = postInput.partial().safeParse(req.body); if (!m || !p.success) { res.status(400).json({ error: "Invalid post" }); return; }
  if (m && !(await ownedReadyMedia(m.id, p.data.mediaAssetIds))) { res.status(409).json({ error: "All attached media must be ready" }); return; }
  const [row] = await db.transaction(async (tx) => {
    const [old] = await tx.select().from(postsTable).where(and(eq(postsTable.id, String(req.params.id)), eq(postsTable.authorMemberId, m.id))).for("update");
    if (!old || old.status === "deleted") return [];
     if (p.data.mediaAssetIds !== undefined && !(await ownedReadyMedia(m.id, p.data.mediaAssetIds, tx))) return [];
     const audience = p.data.audience ?? old.audience; const circleId = p.data.circleId === undefined ? old.circleId : p.data.circleId; const groupId = p.data.groupId === undefined ? old.groupId : p.data.groupId;
     if ((audience === "my_circle" && !(await canUseCircle(circleId, m.id, tx))) || (audience !== "my_circle" && circleId) || (audience === "this_group" && !(await canUseGroup(groupId, m.id, tx))) || (audience !== "this_group" && groupId)) return [];
    if (p.data.originalPostId !== undefined && p.data.originalPostId !== old.originalPostId) return [];
    if (p.data.audience && old.originalPostId) {
      const [source] = await tx.select().from(postsTable).where(eq(postsTable.id, old.originalPostId)).for("update");
      if (p.data.audience === "my_circle" || source?.audience === "my_circle" || p.data.audience === "this_group" || source?.audience === "this_group") return [];
      const rank = { only_me: 0, friends: 1, public: 2 } as const;
      if (!source || !(await visiblePost(source, m.id, tx)) || rank[p.data.audience] > rank[source.audience as keyof typeof rank]) return [];
    }
    if (p.data.body !== undefined && p.data.body !== old.body) {
      const moderation = await intakeForModeration({ contentId: old.id, subjectMemberId: m.id, text: p.data.body, executor: tx });
      if (moderation.state === "held") return tx.update(postsTable).set(p.data).where(eq(postsTable.id, old.id)).returning();
    }
    return tx.update(postsTable).set(p.data).where(eq(postsTable.id, old.id)).returning();
  });
  if (!row) { res.status(404).json({ error: "Post not found" }); return; }
  res.json(await response(row, m.id));
});
router.post("/posts/:id/publish", memberRateLimit(10, 60_000, "post-publish"), async (req, res): Promise<void> => {
  const m = await member(req); if (!m) { res.status(404).json({ error: "Draft not found" }); return; }
  const result = await db.transaction(async (tx) => {
    const [old] = await tx.select().from(postsTable).where(and(eq(postsTable.id, String(req.params.id)), eq(postsTable.authorMemberId, m.id))).for("update");
    if (!old || old.status === "deleted") return undefined;
     const attached = old.mediaAssetIds?.length ? await tx.select({ status: mediaAssetsTable.status }).from(mediaAssetsTable).where(and(eq(mediaAssetsTable.ownerMemberId, m.id), inArray(mediaAssetsTable.id, old.mediaAssetIds))) : [];
     if (attached.length !== (old.mediaAssetIds?.length ?? 0) || attached.some((asset) => asset.status !== "ready")) return undefined;
    const moderation = await intakeForModeration({ contentId: old.id, subjectMemberId: m.id, text: old.body, executor: tx });
    if ((old.audience === "my_circle" && !(await canUseCircle(old.circleId, m.id, tx)) || old.audience === "this_group" && !(await canUseGroup(old.groupId, m.id, tx)))) return undefined;
    const [row] = await tx.update(postsTable).set({ status: "published", publishedAt: sql`now()` }).where(and(eq(postsTable.id, old.id), eq(postsTable.status, "draft"))).returning();
    return row ? { row, moderation } : undefined;
  });
  if (!result) { res.status(404).json({ error: "Draft not found" }); return; }
  const { row, moderation } = result;
  res.json({ post: await response(row, m.id), moderation });
});
router.delete("/posts/:id", async (req, res): Promise<void> => {
  const m = await member(req); if (!m) { res.status(401).end(); return; }
  const [row] = await db.transaction(async (tx) => {
    const [old] = await tx.select().from(postsTable).where(and(eq(postsTable.id, String(req.params.id)), eq(postsTable.authorMemberId, m.id))).for("update");
    if (!old || old.status === "deleted") return [];
    return tx.update(postsTable).set({ status: "deleted", deletedAt: new Date(), body: "" }).where(eq(postsTable.id, old.id)).returning();
  });
  if (!row) { res.status(404).json({ error: "Post not found" }); return; }
  await cleanupDetachedVideoAssets(row.mediaAssetIds);
  res.sendStatus(204);
});
router.post("/posts/:id/reactions", async (req, res): Promise<void> => {
  const m = await member(req); const p = z.object({ kind: z.enum(["hear_you", "thank_you_for_sharing"]) }).strict().safeParse(req.body); const id = String(req.params.id);
  const post = (await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1))[0];
  if (!m || !p.success || !post || !(await visiblePost(post, m.id))) { res.status(404).json({ error: "Post not found" }); return; }
  const result = await db.transaction(async (tx) => {
    await lockPair(tx, m.id, post.authorMemberId);
    const [locked] = await tx.select().from(postsTable).where(eq(postsTable.id, id)).for("update");
    if (!locked || !(await visiblePost(locked, m.id, tx))) return { authorized: false, active: false };
    const [found] = await tx.select().from(postReactionsTable).where(and(eq(postReactionsTable.postId, id), eq(postReactionsTable.memberId, m.id), eq(postReactionsTable.kind, p.data.kind))).limit(1);
    if (found) await tx.delete(postReactionsTable).where(eq(postReactionsTable.id, found.id)); else await tx.insert(postReactionsTable).values({ id: randomUUID(), postId: id, memberId: m.id, kind: p.data.kind });
    const active = !found;
    if (active && locked.authorMemberId !== m.id) await tx.insert(notificationEventsTable).values({ id: randomUUID(), eventType: "post_reaction", actorMemberId: m.id, recipientMemberId: locked.authorMemberId, postId: id, moderationState: "allowed" });
    return { authorized: true, active };
  });
  if (!result.authorized) { res.status(404).json({ error: "Post not found" }); return; }
  res.json({ active: result.active });
});
router.post("/posts/:id/save", async (req, res): Promise<void> => {
  const m = await member(req); const id = String(req.params.id);
  if (!m) { res.status(401).end(); return; }
  const ok = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(postsTable).where(eq(postsTable.id, id));
    if (!p || !(await visiblePost(p, m.id, tx))) return false;
    await lockPair(tx, m.id, p.authorMemberId);
    const [locked] = await tx.select().from(postsTable).where(eq(postsTable.id, id)).for("update");
    if (!locked || !(await visiblePost(locked, m.id, tx))) return false;
    await tx.insert(postSavesTable).values({ id: randomUUID(), postId: id, memberId: m.id }).onConflictDoNothing();
    return true;
  });
  if (!ok) { res.status(404).json({ error: "Post not found" }); return; } res.sendStatus(204);
});
router.delete("/posts/:id/save", async (req, res): Promise<void> => {
  const m = await member(req); if (!m) { res.status(401).end(); return; }
  const id = String(req.params.id);
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(postsTable).where(eq(postsTable.id, id));
    if (p) { await lockPair(tx, m.id, p.authorMemberId); const [locked] = await tx.select().from(postsTable).where(eq(postsTable.id, id)).for("update"); if (locked && await visiblePost(locked, m.id, tx)) await tx.delete(postSavesTable).where(and(eq(postSavesTable.postId, id), eq(postSavesTable.memberId, m.id))); }
  });
  res.sendStatus(204);
});
router.post("/posts/:id/hide", async (req, res): Promise<void> => {
  const m = await member(req); if (!m) { res.status(401).end(); return; }
  const ok = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(postsTable).where(eq(postsTable.id, String(req.params.id)));
    if (!p) return false; await lockPair(tx, m.id, p.authorMemberId);
    const [locked] = await tx.select().from(postsTable).where(eq(postsTable.id, p.id)).for("update");
    if (!locked || !(await visiblePost(locked, m.id, tx))) return false;
    await tx.insert(postHidesTable).values({ id: randomUUID(), postId: locked.id, memberId: m.id }).onConflictDoNothing(); return true;
  });
  if (!ok) { res.status(404).json({ error: "Post not found" }); return; } res.sendStatus(204);
});
router.delete("/posts/:id/hide", async (req, res): Promise<void> => {
  const m = await member(req); if (!m) { res.status(401).end(); return; }
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(postsTable).where(eq(postsTable.id, String(req.params.id)));
    if (p) { await lockPair(tx, m.id, p.authorMemberId); const [locked] = await tx.select().from(postsTable).where(eq(postsTable.id, p.id)).for("update"); if (locked && await visiblePost(locked, m.id, tx)) await tx.delete(postHidesTable).where(and(eq(postHidesTable.postId, p.id), eq(postHidesTable.memberId, m.id))); }
  }); res.sendStatus(204);
});
router.get("/posts/:id/comments", async (req, res): Promise<void> => {
  const m = await member(req); const p = m && (await db.select().from(postsTable).where(eq(postsTable.id, String(req.params.id))).limit(1))[0];
  if (!m || !p || !(await visiblePost(p, m.id)) || await hidden(p.id, m.id)) { res.status(404).end(); return; }
  const comments = await db.select().from(commentsTable).where(and(eq(commentsTable.postId, p.id), eq(commentsTable.status, "active"))).orderBy(asc(commentsTable.createdAt));
  const allowed: typeof comments = [];
  for (const comment of comments) {
    if (await blocked(comment.authorMemberId, m.id)) continue;
    const moderation = (await db.select({ state: moderationRecordsTable.state }).from(moderationRecordsTable).where(eq(moderationRecordsTable.contentId, comment.id)).orderBy(desc(moderationRecordsTable.createdAt)).limit(1))[0];
    if (moderation && !["allowed", "pending"].includes(moderation.state) && comment.authorMemberId !== m.id) continue;
    allowed.push(comment);
  }
  res.json(allowed);
});
router.post("/posts/:id/comments", memberRateLimit(30, 60_000, "comment-mutation"), async (req, res): Promise<void> => {
  const m = await member(req); const body = commentInput.safeParse(req.body); if (!m || !body.success) { res.status(404).json({ error: "Post not found" }); return; }
  const result = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(postsTable).where(eq(postsTable.id, String(req.params.id)));
    if (!p || !(await visiblePost(p, m.id, tx))) return { error: "Post not found" as const };
    await lockPair(tx, m.id, p.authorMemberId);
    const [locked] = await tx.select().from(postsTable).where(eq(postsTable.id, p.id)).for("update");
    if (!locked || !(await visiblePost(locked, m.id, tx))) return { error: "Post not found" as const };
    if (!locked.commentsOpen) return { error: "Comments are closed" as const };
    if (body.data.parentCommentId) {
      const [parent] = await tx.select().from(commentsTable).where(and(eq(commentsTable.id, body.data.parentCommentId), eq(commentsTable.postId, p.id), eq(commentsTable.status, "active"))).for("update");
      if (!parent || parent.parentCommentId) return { error: "Only one level of replies is supported" as const };
    }
    const id = randomUUID(); const c = await intakeForModeration({ contentId: id, subjectMemberId: m.id, text: body.data.body });
    if (c.state === "held") return { error: "Comment is awaiting moderation" as const, moderation: c };
    const [row] = await tx.insert(commentsTable).values({ id, postId: p.id, authorMemberId: m.id, parentCommentId: body.data.parentCommentId, body: body.data.body }).returning();
    if (p.authorMemberId !== m.id) await tx.insert(notificationEventsTable).values({ id: randomUUID(), eventType: body.data.parentCommentId ? "comment_reply" : "post_comment", actorMemberId: m.id, recipientMemberId: p.authorMemberId, postId: p.id, commentId: row.id, moderationState: "allowed" });
    return { row };
  });
  if ("error" in result) { res.status(result.error === "Comments are closed" ? 409 : 404).json({ error: result.error, ...("moderation" in result ? { moderation: result.moderation } : {}) }); return; }
  const { row } = result;
  res.status(201).json(row);
});
router.patch("/comments/:id", async (req, res): Promise<void> => {
  const m = await member(req); const body = z.object({ body: z.string().max(10000) }).strict().safeParse(req.body);
  if (!m || !body.success) { res.status(404).end(); return; }
  const result = await db.transaction(async (tx) => {
    const [old] = await tx.select().from(commentsTable).where(and(eq(commentsTable.id, String(req.params.id)), eq(commentsTable.authorMemberId, m.id), eq(commentsTable.status, "active")));
    if (!old) return undefined;
    const [post] = await tx.select().from(postsTable).where(eq(postsTable.id, old.postId));
    if (!post || !(await visiblePost(post, m.id, tx))) return undefined;
    await lockPair(tx, m.id, post.authorMemberId);
    const [locked] = await tx.select().from(commentsTable).where(eq(commentsTable.id, old.id)).for("update");
    if (!locked || locked.status !== "active") return undefined;
    const mod = await intakeForModeration({ contentId: old.id, subjectMemberId: m.id, text: body.data.body });
    if (mod.state === "held") return { held: true };
    const [row] = await tx.update(commentsTable).set({ body: body.data.body }).where(eq(commentsTable.id, old.id)).returning();
    return { row };
  });
  if (!result) { res.status(404).end(); return; } if ("held" in result) { res.status(400).json({ error: "Comment is awaiting moderation" }); return; } res.json(result.row);
});
router.delete("/comments/:id", async (req, res): Promise<void> => {
  const m = await member(req); if (!m) { res.status(401).end(); return; }
  const row = await db.transaction(async (tx) => {
    const [old] = await tx.select().from(commentsTable).where(and(eq(commentsTable.id, String(req.params.id)), eq(commentsTable.authorMemberId, m.id), eq(commentsTable.status, "active")));
    if (!old) return undefined;
    const [post] = await tx.select().from(postsTable).where(eq(postsTable.id, old.postId)); if (!post) return undefined;
    await lockPair(tx, m.id, post.authorMemberId);
    const [locked] = await tx.select().from(commentsTable).where(eq(commentsTable.id, old.id)).for("update");
    if (!locked || locked.status !== "active" || !(await visiblePost(post, m.id, tx))) return undefined;
    const [deleted] = await tx.update(commentsTable).set({ status: "deleted", body: "", deletedAt: new Date() }).where(eq(commentsTable.id, old.id)).returning(); return deleted;
  });
  if (!row) { res.status(404).end(); return; } res.sendStatus(204);
});
export default router;