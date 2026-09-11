import { Router, type Request } from "express";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { circleHistoryGrantsTable, circleMembersTable, circlesTable, db, appealsTable, membersTable, moderationRecordsTable, reportsTable, safetyRelationshipsTable, friendRequestsTable, friendshipsTable, followsTable, postsTable, commentsTable, retainedEvidenceTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../middlewares/account-auth";
import "../lib/safety-deletion-hook";

const router = Router();
router.use("/safety", requireAuth);
router.use("/reports", requireAuth);
router.use("/appeals", requireAuth);
router.use("/support-contact", requireAuth);

async function memberFor(req: Request) {
  const userId = getAuth(req).userId!;
  return (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, userId)).limit(1))[0];
}
const memberPair = (a: string, b: string) => a < b ? [a, b] as const : [b, a] as const;
async function lockMemberPair(tx: { execute: (query: unknown) => Promise<unknown> }, a: string, b: string) {
  const [left, right] = memberPair(a, b);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${left + ":" + right}, 0))`);
}
async function reportAccessible(contentId: string, kind: "post" | "comment", viewer: string) {
  const post = kind === "post" ? (await db.select().from(postsTable).where(eq(postsTable.id, contentId)).limit(1))[0] : undefined;
  const comment = kind === "comment" ? (await db.select().from(commentsTable).where(eq(commentsTable.id, contentId)).limit(1))[0] : undefined;
  const author = post?.authorMemberId ?? comment?.authorMemberId;
  if (!author || author === viewer) return false;
  const blocked = (await db.select({ id: safetyRelationshipsTable.id }).from(safetyRelationshipsTable).where(and(eq(safetyRelationshipsTable.kind, "block"), or(and(eq(safetyRelationshipsTable.actorMemberId, author), eq(safetyRelationshipsTable.targetMemberId, viewer)), and(eq(safetyRelationshipsTable.actorMemberId, viewer), eq(safetyRelationshipsTable.targetMemberId, author))))).limit(1))[0];
  if (blocked) return false;
  if (post) {
    if (post.status !== "published" || post.audience === "only_me") return false;
    if (post.audience === "friends") {
      const [a, b] = author < viewer ? [author, viewer] : [viewer, author];
      if (!(await db.select({ id: friendshipsTable.id }).from(friendshipsTable).where(and(eq(friendshipsTable.memberAId, a), eq(friendshipsTable.memberBId, b))).limit(1))[0]) return false;
    }
  } else if (comment && comment.status !== "active") return false;
  return true;
}
router.get("/safety/relationships", async (req, res): Promise<void> => {
  const member = await memberFor(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  res.json(await db.select().from(safetyRelationshipsTable).where(eq(safetyRelationshipsTable.actorMemberId, member.id)).orderBy(desc(safetyRelationshipsTable.createdAt)));
});
const relationshipInput = z.object({ targetMemberId: z.string().min(1) }).strict();
async function lockCircleMembers(tx: { execute: (query: unknown) => Promise<unknown> }, pairs: Array<{ circleId: string; memberId: string }>) {
  for (const { circleId, memberId } of [...new Map(pairs.map((pair) => [`${pair.circleId}:${pair.memberId}`, pair])).values()].sort((left, right) => `${left.circleId}:${left.memberId}`.localeCompare(`${right.circleId}:${right.memberId}`))) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${circleId + ":" + memberId}, 0))`);
  }
}
router.post("/safety/:kind", async (req, res): Promise<void> => {
  const kind = z.enum(["block", "mute", "restrict"]).safeParse(req.params.kind);
  const input = relationshipInput.safeParse(req.body);
  const member = await memberFor(req);
  if (!kind.success || !input.success) { res.status(400).json({ error: "Invalid safety relationship" }); return; }
  const target = (await db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.id, input.data.targetMemberId)).limit(1))[0];
  if (!member || !target || member.id === input.data.targetMemberId) { res.status(400).json({ error: "Invalid target member" }); return; }
  const [record] = await db.transaction(async (tx) => {
    const [left, right] = member.id < input.data.targetMemberId ? [member.id, input.data.targetMemberId] : [input.data.targetMemberId, member.id];
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${left + ":" + right}, 0))`);
    const [created] = await tx.insert(safetyRelationshipsTable).values({ id: randomUUID(), actorMemberId: member.id, targetMemberId: input.data.targetMemberId, kind: kind.data }).onConflictDoNothing().returning();
    if (kind.data === "block") {
      const [a, b] = [left, right];
      await tx.delete(friendRequestsTable).where(and(eq(friendRequestsTable.memberAId, a), eq(friendRequestsTable.memberBId, b)));
      await tx.delete(friendshipsTable).where(and(eq(friendshipsTable.memberAId, a), eq(friendshipsTable.memberBId, b)));
      await tx.delete(followsTable).where(or(and(eq(followsTable.followerMemberId, member.id), eq(followsTable.followedMemberId, input.data.targetMemberId)), and(eq(followsTable.followerMemberId, input.data.targetMemberId), eq(followsTable.followedMemberId, member.id))));
      const [myMemberships, theirMemberships] = await Promise.all([
        tx.select({ circleId: circleMembersTable.circleId }).from(circleMembersTable).where(and(eq(circleMembersTable.memberId, member.id), eq(circleMembersTable.status, "active"))),
        tx.select({ circleId: circleMembersTable.circleId }).from(circleMembersTable).where(and(eq(circleMembersTable.memberId, input.data.targetMemberId), eq(circleMembersTable.status, "active"))),
      ]);
      const theirCircleIds = new Set(theirMemberships.map((row) => row.circleId));
      const sharedCircleIds = myMemberships.map((row) => row.circleId).filter((circleId) => theirCircleIds.has(circleId));
      if (sharedCircleIds.length) {
        await lockCircleMembers(tx, sharedCircleIds.flatMap((circleId) => [{ circleId, memberId: member.id }, { circleId, memberId: input.data.targetMemberId }]));
        const owners = await tx.select({ circleId: circlesTable.id, ownerMemberId: circlesTable.ownerMemberId }).from(circlesTable).where(inArray(circlesTable.id, sharedCircleIds));
        const ownerCircleIds = owners.filter((circle) => circle.ownerMemberId === member.id).map((circle) => circle.circleId);
        const selfCircleIds = sharedCircleIds.filter((circleId) => !ownerCircleIds.includes(circleId));
        if (ownerCircleIds.length) {
          await tx.update(circleMembersTable).set({ status: "removed", removedAt: new Date() }).where(and(inArray(circleMembersTable.circleId, ownerCircleIds), eq(circleMembersTable.memberId, input.data.targetMemberId), eq(circleMembersTable.status, "active")));
          await tx.update(circleHistoryGrantsTable).set({ status: "revoked", revokedAt: new Date() }).where(and(inArray(circleHistoryGrantsTable.circleId, ownerCircleIds), eq(circleHistoryGrantsTable.memberId, input.data.targetMemberId), eq(circleHistoryGrantsTable.status, "active")));
        }
        if (selfCircleIds.length) {
          await tx.update(circleMembersTable).set({ status: "removed", removedAt: new Date() }).where(and(inArray(circleMembersTable.circleId, selfCircleIds), eq(circleMembersTable.memberId, member.id), eq(circleMembersTable.status, "active")));
          await tx.update(circleHistoryGrantsTable).set({ status: "revoked", revokedAt: new Date() }).where(and(inArray(circleHistoryGrantsTable.circleId, selfCircleIds), eq(circleHistoryGrantsTable.memberId, member.id), eq(circleHistoryGrantsTable.status, "active")));
        }
      }
    }
    return [created] as const;
  });
  if (!record) { res.status(200).json({ status: "already_exists" }); return; }
  res.status(201).json(record);
});
router.delete("/safety/:kind/:targetMemberId", async (req, res): Promise<void> => {
  const kind = z.enum(["block", "mute", "restrict"]).safeParse(req.params.kind);
  const member = await memberFor(req);
  if (!kind.success || !member) { res.status(400).json({ error: "Invalid request" }); return; }
  await db.transaction(async (tx) => {
    await lockMemberPair(tx, member.id, String(req.params.targetMemberId));
    await tx.delete(safetyRelationshipsTable).where(and(eq(safetyRelationshipsTable.actorMemberId, member.id), eq(safetyRelationshipsTable.targetMemberId, String(req.params.targetMemberId)), eq(safetyRelationshipsTable.kind, kind.data)));
  });
  res.sendStatus(204);
});

router.post("/reports", async (req, res): Promise<void> => {
  const member = await memberFor(req);
  const parsed = z.object({ targetMemberId: z.string().optional(), contentId: z.string().optional(), contentTargetType: z.enum(["post", "comment"]).optional(), contentTargetId: z.string().optional(), category: z.enum(["harassment", "threats", "exploitation", "scams", "impersonation", "hateful_content", "dangerous_medical_claims", "distress_disclosure", "respectful_disagreement"]), details: z.string().max(5000).optional() }).strict().safeParse(req.body);
  if (!member || !parsed.success) { res.status(400).json({ error: "Invalid report" }); return; }
  if (parsed.data.targetMemberId === member.id) { res.status(400).json({ error: "You cannot report yourself" }); return; }
  if (parsed.data.targetMemberId && !(await db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.id, parsed.data.targetMemberId)).limit(1))[0]) { res.status(400).json({ error: "Target member not found" }); return; }
  const contentId = parsed.data.contentId ?? parsed.data.contentTargetId;
  if ((parsed.data.contentTargetType && !parsed.data.contentTargetId) || (parsed.data.contentTargetId && !parsed.data.contentTargetType)) { res.status(404).json({ error: "Content target not found" }); return; }
  if (contentId) {
    const post = parsed.data.contentTargetType === "comment" ? undefined : (await db.select({ id: postsTable.id }).from(postsTable).where(eq(postsTable.id, contentId)).limit(1))[0];
    const comment = parsed.data.contentTargetType === "post" ? undefined : (await db.select({ id: commentsTable.id }).from(commentsTable).where(eq(commentsTable.id, contentId)).limit(1))[0];
    if (!post && !comment) { res.status(400).json({ error: "Content target not found" }); return; }
  }
  const createdResult = await db.transaction(async (tx) => {
    let evidence: { contentId: string; contentKind: string; authorMemberId: string | null; bodySnapshot: string } | undefined;
    if (contentId) {
      const post = parsed.data.contentTargetType === "comment" ? undefined : (await tx.select().from(postsTable).where(eq(postsTable.id, contentId)).limit(1))[0];
      const comment = parsed.data.contentTargetType === "post" ? undefined : (await tx.select().from(commentsTable).where(eq(commentsTable.id, contentId)).limit(1))[0];
      if (!post && !comment) throw new Error("Content target not found");
      const author = post?.authorMemberId ?? comment?.authorMemberId;
      if (comment) {
        const [parentHint] = await tx.select({ authorMemberId: postsTable.authorMemberId }).from(postsTable).innerJoin(commentsTable, eq(commentsTable.postId, postsTable.id)).where(eq(commentsTable.id, comment.id)).limit(1);
        for (const authorId of [author, parentHint?.authorMemberId].filter((id): id is string => !!id && id !== member.id).sort()) await lockMemberPair(tx, member.id, authorId);
      } else if (author && author !== member.id) await lockMemberPair(tx, member.id, author);
      if (post) {
        const [locked] = await tx.select().from(postsTable).where(eq(postsTable.id, post.id)).for("update");
        if (!locked) throw new Error("Content target not found");
        const bilateralBlock = (await tx.select({ id: safetyRelationshipsTable.id }).from(safetyRelationshipsTable).where(and(eq(safetyRelationshipsTable.kind, "block"), or(and(eq(safetyRelationshipsTable.actorMemberId, locked.authorMemberId), eq(safetyRelationshipsTable.targetMemberId, member.id)), and(eq(safetyRelationshipsTable.actorMemberId, member.id), eq(safetyRelationshipsTable.targetMemberId, locked.authorMemberId))))).limit(1))[0];
        const moderation = (await tx.select({ state: moderationRecordsTable.state }).from(moderationRecordsTable).where(eq(moderationRecordsTable.contentId, locked.id)).orderBy(desc(moderationRecordsTable.createdAt)).limit(1))[0];
        const friends = locked.audience === "friends" && !!(await tx.select({ id: friendshipsTable.id }).from(friendshipsTable).where(and(eq(friendshipsTable.memberAId, member.id < locked.authorMemberId ? member.id : locked.authorMemberId), eq(friendshipsTable.memberBId, member.id < locked.authorMemberId ? locked.authorMemberId : member.id))).limit(1))[0];
        const allowed = locked.status === "published" && (locked.authorMemberId === member.id || locked.audience === "public" || friends) && (!moderation || moderation.state === "allowed") && !bilateralBlock;
        if (!allowed) throw new Error("Content target not found");
        evidence = { contentId: locked.id, contentKind: "post", authorMemberId: locked.authorMemberId, bodySnapshot: locked.body };
      } else {
        const [parent] = await tx.select().from(postsTable).where(eq(postsTable.id, comment!.postId)).for("update");
        const [locked] = await tx.select().from(commentsTable).where(eq(commentsTable.id, comment!.id)).for("update");
        if (!locked) throw new Error("Content target not found");
        if (!parent || locked.status !== "active") throw new Error("Content target not found");
        const blockedPair = (await tx.select({ id: safetyRelationshipsTable.id }).from(safetyRelationshipsTable).where(and(eq(safetyRelationshipsTable.kind, "block"), or(and(eq(safetyRelationshipsTable.actorMemberId, locked.authorMemberId), eq(safetyRelationshipsTable.targetMemberId, member.id)), and(eq(safetyRelationshipsTable.actorMemberId, member.id), eq(safetyRelationshipsTable.targetMemberId, locked.authorMemberId)), and(eq(safetyRelationshipsTable.actorMemberId, parent.authorMemberId), eq(safetyRelationshipsTable.targetMemberId, member.id)), and(eq(safetyRelationshipsTable.actorMemberId, member.id), eq(safetyRelationshipsTable.targetMemberId, parent.authorMemberId))))).limit(1))[0];
        const parentMod = (await tx.select({ state: moderationRecordsTable.state }).from(moderationRecordsTable).where(eq(moderationRecordsTable.contentId, parent.id)).orderBy(desc(moderationRecordsTable.createdAt)).limit(1))[0];
        const commentMod = (await tx.select({ state: moderationRecordsTable.state }).from(moderationRecordsTable).where(eq(moderationRecordsTable.contentId, locked.id)).orderBy(desc(moderationRecordsTable.createdAt)).limit(1))[0];
        const parentFriend = parent.audience === "friends" && !!(await tx.select({ id: friendshipsTable.id }).from(friendshipsTable).where(and(eq(friendshipsTable.memberAId, member.id < parent.authorMemberId ? member.id : parent.authorMemberId), eq(friendshipsTable.memberBId, member.id < parent.authorMemberId ? parent.authorMemberId : member.id))).limit(1))[0];
        if (parent.status !== "published" || !(parent.authorMemberId === member.id || parent.audience === "public" || parentFriend) || (parentMod && parentMod.state !== "allowed") || (commentMod && commentMod.state !== "allowed") || blockedPair) throw new Error("Content target not found");
        evidence = { contentId: locked.id, contentKind: "comment", authorMemberId: locked.authorMemberId, bodySnapshot: locked.body };
      }
    }
    const [created] = await tx.insert(reportsTable).values({ id: randomUUID(), reporterMemberId: member.id, targetMemberId: parsed.data.targetMemberId, contentId, category: parsed.data.category, details: parsed.data.details }).returning();
    const [record] = await tx.insert(moderationRecordsTable).values({ id: randomUUID(), reportId: created.id, contentId: created.contentId, subjectMemberId: created.targetMemberId, state: "pending" }).returning();
    if (evidence) await tx.insert(retainedEvidenceTable).values({ id: randomUUID(), reportId: created.id, ...evidence, policyVersion: "phase-6-v1", retentionReason: "reported-content" });
    return [created, record] as const;
  }).catch(() => null);
  if (!createdResult) { res.status(404).json({ error: "Content target not found" }); return; }
  const [report, moderation] = createdResult;
  res.status(201).json({ report, moderationRecord: moderation });
});
router.get("/reports", async (req, res): Promise<void> => {
  const member = await memberFor(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const rows = await db.select({ report: reportsTable, moderationRecord: moderationRecordsTable }).from(reportsTable).leftJoin(moderationRecordsTable, eq(moderationRecordsTable.reportId, reportsTable.id)).where(eq(reportsTable.reporterMemberId, member.id)).orderBy(desc(reportsTable.createdAt));
  res.json(rows);
});
router.post("/appeals", async (req, res): Promise<void> => {
  const member = await memberFor(req);
  const parsed = z.object({ moderationRecordId: z.string().min(1), statement: z.string().trim().min(1).max(5000) }).strict().safeParse(req.body);
  if (!member || !parsed.success) { res.status(400).json({ error: "Invalid appeal" }); return; }
  const appeal = await db.transaction(async (tx) => {
    const [record] = await tx.select().from(moderationRecordsTable).where(and(eq(moderationRecordsTable.id, parsed.data.moderationRecordId), eq(moderationRecordsTable.subjectMemberId, member.id))).limit(1);
    if (!record || !["held", "removed"].includes(record.state)) return null;
    const [created] = await tx.insert(appealsTable).values({ id: randomUUID(), appellantMemberId: member.id, ...parsed.data }).onConflictDoNothing().returning();
    if (!created) return null;
    await tx.update(moderationRecordsTable).set({ state: "appealed" }).where(and(eq(moderationRecordsTable.id, record.id), eq(moderationRecordsTable.state, record.state)));
    await tx.update(reportsTable).set({ status: "appealed" }).where(eq(reportsTable.id, record.reportId!));
    return created;
  });
  if (!appeal) { res.status(409).json({ error: "Appeal is not eligible or already exists" }); return; }
  res.status(201).json(appeal);
});
router.get("/appeals", async (req, res): Promise<void> => {
  const member = await memberFor(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  res.json(await db.select().from(appealsTable).where(eq(appealsTable.appellantMemberId, member.id)).orderBy(desc(appealsTable.createdAt)));
});
router.get("/support-contact", (_req, res): void => {
  const email = process.env.SUPPORT_CONTACT_EMAIL;
  if (!email) { res.status(503).json({ error: "Support contact is not configured" }); return; }
  res.json({ email });
});
export default router;