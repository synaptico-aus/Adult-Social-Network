import { Router, type Request } from "express";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { circleHistoryGrantsTable, circleMembersTable, circlesTable, db, appealsTable, membersTable, moderationRecordsTable, reportsTable, safetyRelationshipsTable, friendRequestsTable, friendshipsTable, followsTable, postsTable, commentsTable, retainedEvidenceTable, groupsTable, groupMembersTable, groupMembershipRequestsTable, groupHostAssignmentsTable, groupWelcomeRequestsTable, conversationsTable, conversationMembersTable, messageRequestsTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../middlewares/account-auth";
import "../lib/safety-deletion-hook";
import { visiblePost } from "./posts";
import { lockGroupAuthority, lockMemberPair, memberPair } from "../lib/member-locks";
import { reportRateLimit } from "../lib/shared-rate-limit";

const router = Router();
router.use("/safety", requireAuth);
router.use("/reports", requireAuth);
router.use("/appeals", requireAuth);
router.use("/support-contact", requireAuth);

async function memberFor(req: Request) {
  const userId = getAuth(req).userId!;
  return (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, userId)).limit(1))[0];
}
async function blocked(a: string, b: string, source: { select: (...args: any[]) => any } = db) {
  return !!(await source.select({ id: safetyRelationshipsTable.id }).from(safetyRelationshipsTable).where(and(
    eq(safetyRelationshipsTable.kind, "block"),
    or(
      and(eq(safetyRelationshipsTable.actorMemberId, a), eq(safetyRelationshipsTable.targetMemberId, b)),
      and(eq(safetyRelationshipsTable.actorMemberId, b), eq(safetyRelationshipsTable.targetMemberId, a)),
    ),
  )).limit(1))[0];
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
async function lockGroupMembers(tx: { execute: (query: unknown) => Promise<unknown> }, pairs: Array<{ groupId: string; memberId: string }>) {
  for (const { groupId, memberId } of [...new Map(pairs.map((pair) => [`${pair.groupId}:${pair.memberId}`, pair])).values()].sort((left, right) => `${left.groupId}:${left.memberId}`.localeCompare(`${right.groupId}:${right.memberId}`))) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${groupId + ":" + memberId}, 0))`);
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
    const [left, right] = memberPair(member.id, input.data.targetMemberId);
    await lockMemberPair(tx, member.id, input.data.targetMemberId);
    const [created] = await tx.insert(safetyRelationshipsTable).values({ id: randomUUID(), actorMemberId: member.id, targetMemberId: input.data.targetMemberId, kind: kind.data }).onConflictDoNothing().returning();
    if (kind.data === "block") {
      const [a, b] = [left, right];
      await tx.delete(friendRequestsTable).where(and(eq(friendRequestsTable.memberAId, a), eq(friendRequestsTable.memberBId, b)));
      await tx.delete(friendshipsTable).where(and(eq(friendshipsTable.memberAId, a), eq(friendshipsTable.memberBId, b)));
      await tx.delete(followsTable).where(or(and(eq(followsTable.followerMemberId, member.id), eq(followsTable.followedMemberId, input.data.targetMemberId)), and(eq(followsTable.followerMemberId, input.data.targetMemberId), eq(followsTable.followedMemberId, member.id))));
      // Messaging is a separate live authorization boundary. Close direct
      // conversations and cancel requests while holding the canonical pair
      // lock, so a concurrent request/send cannot recreate access.
      await tx.update(messageRequestsTable).set({ status: "cancelled", cancelledAt: sql`now()`, cooldownUntil: sql`now() + interval '24 hours'` }).where(and(
        eq(messageRequestsTable.memberAId, left), eq(messageRequestsTable.memberBId, right),
        eq(messageRequestsTable.status, "pending"),
      ));
      const directConversations = await tx.select({ id: conversationsTable.id }).from(conversationsTable).where(and(
        eq(conversationsTable.kind, "direct"), eq(conversationsTable.status, "active"),
        eq(conversationsTable.memberAId, left), eq(conversationsTable.memberBId, right),
      )).for("update");
      for (const conversation of directConversations) {
        await tx.update(conversationMembersTable).set({ status: "removed", removedAt: sql`now()` }).where(and(eq(conversationMembersTable.conversationId, conversation.id), eq(conversationMembersTable.status, "active")));
        await tx.update(conversationsTable).set({ status: "closed", closedAt: sql`now()` }).where(eq(conversationsTable.id, conversation.id));
      }
      // Shared message groups use owner-safe removal: a non-owner blocker is
      // removed from the group conversation; an owner blocker removes the
      // blocked member. Conversation rows are locked in stable id order.
      const sharedConversations = await tx.select({ id: conversationsTable.id }).from(conversationsTable).innerJoin(conversationMembersTable, eq(conversationMembersTable.conversationId, conversationsTable.id)).where(and(
        eq(conversationsTable.kind, "group"), eq(conversationsTable.status, "active"), eq(conversationMembersTable.status, "active"),
        or(eq(conversationMembersTable.memberId, member.id), eq(conversationMembersTable.memberId, input.data.targetMemberId)),
      ));
      for (const { id: conversationId } of [...new Map(sharedConversations.map((row) => [row.id, row])).values()].sort((a, b) => a.id.localeCompare(b.id))) {
        const linked = (await tx.select({ groupId: conversationsTable.groupId }).from(conversationsTable).where(eq(conversationsTable.id, conversationId)).limit(1))[0];
        if (linked?.groupId) await lockGroupAuthority(tx, linked.groupId);
        await tx.select({ id: conversationsTable.id }).from(conversationsTable).where(eq(conversationsTable.id, conversationId)).for("update");
        const active = await tx.select({ memberId: conversationMembersTable.memberId, role: conversationMembersTable.role }).from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, conversationId), eq(conversationMembersTable.status, "active"), inArray(conversationMembersTable.memberId, [member.id, input.data.targetMemberId])));
        if (active.length < 2) continue;
        const owner = active.find((row) => row.role === "owner");
        const removedMemberId = owner?.memberId === member.id ? input.data.targetMemberId : member.id;
        await tx.update(conversationMembersTable).set({ status: "removed", removedAt: sql`now()` }).where(and(eq(conversationMembersTable.conversationId, conversationId), eq(conversationMembersTable.memberId, removedMemberId), eq(conversationMembersTable.status, "active")));
      }
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
      const [myGroups, theirGroups] = await Promise.all([
        tx.select({ groupId: groupMembersTable.groupId }).from(groupMembersTable).where(and(eq(groupMembersTable.memberId, member.id), eq(groupMembersTable.status, "active"))),
        tx.select({ groupId: groupMembersTable.groupId }).from(groupMembersTable).where(and(eq(groupMembersTable.memberId, input.data.targetMemberId), eq(groupMembersTable.status, "active"))),
      ]);
      const initialTheirGroupIds = new Set(theirGroups.map((row) => row.groupId));
      const initialSharedGroupIds = myGroups.map((row) => row.groupId).filter((groupId) => initialTheirGroupIds.has(groupId)).sort();
      if (initialSharedGroupIds.length) {
        // Group joins lock the group row before taking group-member locks.
        // Take those row locks after the member pair so block and join share
        // one order and no membership can appear between snapshots.
        for (const groupId of initialSharedGroupIds) {
          await lockGroupAuthority(tx, groupId);
          await tx.select({ id: groupsTable.id }).from(groupsTable).where(eq(groupsTable.id, groupId)).for("update").limit(1);
        }
        await lockGroupMembers(tx, initialSharedGroupIds.flatMap((groupId) => [
          { groupId, memberId: member.id },
          { groupId, memberId: input.data.targetMemberId },
        ]));
        // Re-read after the pair and group locks. A join which was racing the
        // block must either have waited on the pair lock or be visible here.
        const [lockedMyGroups, lockedTheirGroups] = await Promise.all([
          tx.select({ groupId: groupMembersTable.groupId }).from(groupMembersTable).where(and(eq(groupMembersTable.memberId, member.id), eq(groupMembersTable.status, "active"))),
          tx.select({ groupId: groupMembersTable.groupId }).from(groupMembersTable).where(and(eq(groupMembersTable.memberId, input.data.targetMemberId), eq(groupMembersTable.status, "active"))),
        ]);
        const lockedTheirIds = new Set(lockedTheirGroups.map((row) => row.groupId));
        const sharedGroupIds = lockedMyGroups.map((row) => row.groupId).filter((groupId) => lockedTheirIds.has(groupId)).sort();
        if (!sharedGroupIds.length) return [created] as const;
        const owners = await tx.select({ groupId: groupsTable.id, ownerMemberId: groupsTable.ownerMemberId })
          .from(groupsTable).where(inArray(groupsTable.id, sharedGroupIds));
        const removeTarget = new Set(owners.filter((g) => g.ownerMemberId === member.id).map((g) => g.groupId));
        const removeBlocker = new Set(sharedGroupIds.filter((groupId) => !removeTarget.has(groupId)));
        for (const [groupIds, removedMemberId] of [[removeTarget, input.data.targetMemberId], [removeBlocker, member.id]] as const) {
          const ids = [...groupIds];
          if (!ids.length) continue;
          await tx.update(groupMembersTable).set({ status: "removed", removedAt: sql`now()` })
            .where(and(inArray(groupMembersTable.groupId, ids), eq(groupMembersTable.memberId, removedMemberId), eq(groupMembersTable.status, "active")));
          await tx.update(groupHostAssignmentsTable).set({ active: false, revokedAt: sql`now()` })
            .where(and(inArray(groupHostAssignmentsTable.groupId, ids), eq(groupHostAssignmentsTable.hostMemberId, removedMemberId), eq(groupHostAssignmentsTable.active, true)));
          await tx.update(groupMembershipRequestsTable).set({ status: "cancelled", cancelledAt: sql`now()` })
            .where(and(inArray(groupMembershipRequestsTable.groupId, ids), eq(groupMembershipRequestsTable.memberId, removedMemberId), eq(groupMembershipRequestsTable.status, "pending")));
          await tx.update(groupWelcomeRequestsTable).set({ status: "closed", closedAt: sql`now()` })
            .where(and(
              inArray(groupWelcomeRequestsTable.groupId, ids),
              inArray(groupWelcomeRequestsTable.status, ["open", "acknowledged"]),
              or(eq(groupWelcomeRequestsTable.memberId, removedMemberId), eq(groupWelcomeRequestsTable.acknowledgedByMemberId, removedMemberId)),
            ));
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

router.post("/reports", reportRateLimit, async (req, res): Promise<void> => {
  const member = await memberFor(req);
  const parsed = z.object({ targetMemberId: z.string().optional(), groupId: z.string().optional(), contentId: z.string().optional(), contentTargetType: z.enum(["post", "comment"]).optional(), contentTargetId: z.string().optional(), category: z.enum(["harassment", "threats", "exploitation", "scams", "impersonation", "hateful_content", "dangerous_medical_claims", "distress_disclosure", "respectful_disagreement"]), details: z.string().max(5000).optional() }).strict().safeParse(req.body);
  if (!member || !parsed.success) { res.status(400).json({ error: "Invalid report" }); return; }
  if (parsed.data.targetMemberId === member.id) { res.status(400).json({ error: "You cannot report yourself" }); return; }
  if (parsed.data.targetMemberId && !(await db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.id, parsed.data.targetMemberId)).limit(1))[0]) { res.status(400).json({ error: "Target member not found" }); return; }
  if (parsed.data.groupId) {
    const targetGroup = (await db.select().from(groupsTable).where(and(eq(groupsTable.id, parsed.data.groupId), eq(groupsTable.status, "active"))).limit(1))[0];
    const groupMember = targetGroup && (await db.select({ id: groupMembersTable.id }).from(groupMembersTable).where(and(eq(groupMembersTable.groupId, targetGroup.id), eq(groupMembersTable.memberId, member.id), eq(groupMembersTable.status, "active"))).limit(1))[0];
    if (!targetGroup || (targetGroup.discoverability === "private" && !groupMember)) { res.status(404).json({ error: "Group not found" }); return; }
  }
  const contentId = parsed.data.contentId ?? parsed.data.contentTargetId;
  if ((parsed.data.contentTargetType && !parsed.data.contentTargetId) || (parsed.data.contentTargetId && !parsed.data.contentTargetType)) { res.status(404).json({ error: "Content target not found" }); return; }
  if (contentId) {
    const post = parsed.data.contentTargetType === "comment" ? undefined : (await db.select({ id: postsTable.id }).from(postsTable).where(eq(postsTable.id, contentId)).limit(1))[0];
    const comment = parsed.data.contentTargetType === "post" ? undefined : (await db.select({ id: commentsTable.id }).from(commentsTable).where(eq(commentsTable.id, contentId)).limit(1))[0];
    if (!post && !comment) { res.status(400).json({ error: "Content target not found" }); return; }
  }
  const createdResult = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"report:" + member.id}, 0))`);
    let evidence: { contentId: string; contentKind: string; authorMemberId: string | null; bodySnapshot: string } | undefined;
    if (contentId) {
      const post = parsed.data.contentTargetType === "comment" ? undefined : (await tx.select().from(postsTable).where(eq(postsTable.id, contentId)).limit(1))[0];
      const comment = parsed.data.contentTargetType === "post" ? undefined : (await tx.select().from(commentsTable).where(eq(commentsTable.id, contentId)).limit(1))[0];
      if (!post && !comment) throw new Error("Content target not found");
      const author = post?.authorMemberId ?? comment?.authorMemberId;
      if (author && parsed.data.targetMemberId && parsed.data.targetMemberId !== author) throw new Error("Content target not found");
      if (comment) {
        const [parentHint] = await tx.select({ authorMemberId: postsTable.authorMemberId }).from(postsTable).innerJoin(commentsTable, eq(commentsTable.postId, postsTable.id)).where(eq(commentsTable.id, comment.id)).limit(1);
        for (const authorId of [author, parentHint?.authorMemberId].filter((id): id is string => !!id && id !== member.id).sort()) await lockMemberPair(tx, member.id, authorId);
      } else if (author && author !== member.id) await lockMemberPair(tx, member.id, author);
      if (post) {
        const [locked] = await tx.select().from(postsTable).where(eq(postsTable.id, post.id)).for("update");
        if (!locked) throw new Error("Content target not found");
        if ((locked.groupId ?? null) !== (parsed.data.groupId ?? null) || locked.authorMemberId === member.id || !(await visiblePost(locked, member.id, tx))) throw new Error("Content target not found");
        evidence = { contentId: locked.id, contentKind: "post", authorMemberId: locked.authorMemberId, bodySnapshot: locked.body };
      } else {
        const [parent] = await tx.select().from(postsTable).where(eq(postsTable.id, comment!.postId)).for("update");
        const [locked] = await tx.select().from(commentsTable).where(eq(commentsTable.id, comment!.id)).for("update");
        if (!locked) throw new Error("Content target not found");
         const commentModeration = (await tx.select({ state: moderationRecordsTable.state }).from(moderationRecordsTable).where(eq(moderationRecordsTable.contentId, locked.id)).orderBy(desc(moderationRecordsTable.createdAt)).limit(1))[0];
         if (!parent || locked.status !== "active" || (commentModeration && !["allowed", "pending"].includes(commentModeration.state)) || await blocked(locked.authorMemberId, member.id, tx)) throw new Error("Content target not found");
         if ((parent.groupId ?? null) !== (parsed.data.groupId ?? null) || locked.authorMemberId === member.id || !(await visiblePost(parent, member.id, tx))) throw new Error("Content target not found");
        evidence = { contentId: locked.id, contentKind: "comment", authorMemberId: locked.authorMemberId, bodySnapshot: locked.body };
      }
    }
    const [duplicate] = await tx.select().from(reportsTable).where(and(
      eq(reportsTable.reporterMemberId, member.id), eq(reportsTable.category, parsed.data.category),
      sql`${reportsTable.targetMemberId} is not distinct from ${evidence?.authorMemberId ?? parsed.data.targetMemberId ?? null}`,
      sql`${reportsTable.groupId} is not distinct from ${parsed.data.groupId ?? null}`,
      sql`${reportsTable.contentId} is not distinct from ${contentId ?? null}`,
      sql`${reportsTable.details} is not distinct from ${parsed.data.details ?? null}`,
      sql`${reportsTable.createdAt} > now() - interval '10 minutes'`,
    )).orderBy(desc(reportsTable.createdAt)).limit(1);
    if (duplicate) {
      const [record] = await tx.select().from(moderationRecordsTable).where(eq(moderationRecordsTable.reportId, duplicate.id)).limit(1);
      if (record) return [duplicate, record] as const;
    }
    const [created] = await tx.insert(reportsTable).values({ id: randomUUID(), reporterMemberId: member.id, targetMemberId: evidence?.authorMemberId ?? parsed.data.targetMemberId, groupId: parsed.data.groupId, contentId, category: parsed.data.category, details: parsed.data.details }).returning();
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