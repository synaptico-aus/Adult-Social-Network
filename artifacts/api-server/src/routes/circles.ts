import { Router, type Request } from "express";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import { circleHistoryGrantsTable, circleInvitationsTable, circleMembersTable, circlesTable, db, membersTable, notificationEventsTable, postsTable, profilesTable, safetyRelationshipsTable } from "@workspace/db";
import { requireAuth, memberRateLimit } from "../middlewares/account-auth";
import { response as postResponse, visiblePost } from "./posts";

const router = Router();
router.use("/circles", requireAuth);
router.use("/circle-invitations", requireAuth);
const id = () => randomUUID();
type QuerySource = { select: (...args: any[]) => any };
const member = async (req: Request) => {
  const clerkUserId = getAuth(req).userId;
  return clerkUserId ? (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, clerkUserId)).limit(1))[0] : undefined;
};
const blocked = async (source: QuerySource, left: string, right: string) => !!(await source.select({ id: safetyRelationshipsTable.id }).from(safetyRelationshipsTable).where(and(eq(safetyRelationshipsTable.kind, "block"), or(and(eq(safetyRelationshipsTable.actorMemberId, left), eq(safetyRelationshipsTable.targetMemberId, right)), and(eq(safetyRelationshipsTable.actorMemberId, right), eq(safetyRelationshipsTable.targetMemberId, left))))).limit(1))[0];
async function activeMembership(source: QuerySource, circleId: string, memberId: string) {
  return (await source.select().from(circleMembersTable).where(and(eq(circleMembersTable.circleId, circleId), eq(circleMembersTable.memberId, memberId), eq(circleMembersTable.status, "active"))).limit(1))[0];
}
async function blockedByAnyMember(source: QuerySource, circleId: string, memberId: string) {
  const rows = await source.select({ memberId: circleMembersTable.memberId }).from(circleMembersTable).where(and(eq(circleMembersTable.circleId, circleId), eq(circleMembersTable.status, "active")));
  for (const row of rows) if (row.memberId !== memberId && await blocked(source, row.memberId, memberId)) return true;
  return false;
}
async function circleView(circle: typeof circlesTable.$inferSelect, viewerId: string) {
  const members = await db.select({ member: circleMembersTable, preferredName: profilesTable.preferredName }).from(circleMembersTable).leftJoin(profilesTable, eq(profilesTable.memberId, circleMembersTable.memberId)).where(and(eq(circleMembersTable.circleId, circle.id), eq(circleMembersTable.status, "active"))).orderBy(desc(circleMembersTable.role), circleMembersTable.joinedAt);
  const mine = members.find((row) => row.member.memberId === viewerId)?.member;
  const grants = await db.select({ memberId: circleHistoryGrantsTable.memberId }).from(circleHistoryGrantsTable).where(and(eq(circleHistoryGrantsTable.circleId, circle.id), eq(circleHistoryGrantsTable.status, "active")));
  const grantMembers = new Set(grants.map((grant) => grant.memberId));
  return { ...circle, members: members.map(({ member, preferredName }) => ({ memberId: member.memberId, role: member.role, joinedAt: member.joinedAt, preferredName: preferredName ?? "Member", historyAccess: grantMembers.has(member.memberId) })), myRole: mine?.role ?? null, historyAccess: grantMembers.has(viewerId) };
}
function canManage(role: string | undefined) { return role === "owner" || role === "admin"; }
async function lockCircleMember(tx: { execute: (query: unknown) => Promise<unknown> }, circleId: string, memberId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${circleId + ":" + memberId}, 0))`);
}
async function lockCircleMembers(tx: { execute: (query: unknown) => Promise<unknown> }, circleId: string, ...memberIds: string[]) {
  for (const memberId of [...new Set(memberIds)].sort()) await lockCircleMember(tx, circleId, memberId);
}
async function lockRelationshipPair(tx: { execute: (query: unknown) => Promise<unknown> }, first: string, second: string) {
  const [left, right] = first < second ? [first, second] : [second, first];
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${left + ":" + right}, 0))`);
}
async function lockCircleInvitationAuthorization(tx: any, circleId: string, inviteeId: string) {
  const rows = await tx.select({ memberId: circleMembersTable.memberId }).from(circleMembersTable).where(and(eq(circleMembersTable.circleId, circleId), eq(circleMembersTable.status, "active"))) as { memberId: string }[];
  const pairs: string[] = [...new Set(rows.map(({ memberId }) => [memberId, inviteeId].sort().join(":")))].sort();
  for (const pair of pairs) {
    const [left, right] = pair.split(":");
    await lockRelationshipPair(tx, left!, right!);
  }
}
async function notify(recipientMemberId: string, actorMemberId: string, eventType: string) {
  await db.insert(notificationEventsTable).values({ id: id(), recipientMemberId, actorMemberId, eventType, moderationState: "allowed" });
}

router.post("/circles", memberRateLimit(10, 60_000, "circle-mutation"), async (req, res): Promise<void> => {
  const m = await member(req); const body = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).optional() }).strict().safeParse(req.body);
  if (!m || !body.success) { res.status(400).json({ error: "Enter a circle name" }); return; }
  const circle = await db.transaction(async (tx) => {
    const [created] = await tx.insert(circlesTable).values({ id: id(), ownerMemberId: m.id, name: body.data.name, description: body.data.description }).returning();
    await tx.insert(circleMembersTable).values({ id: id(), circleId: created.id, memberId: m.id, invitedByMemberId: m.id, role: "owner" });
    return created;
  });
  res.status(201).json(await circleView(circle, m.id));
});
router.get("/circles", async (req, res): Promise<void> => {
  const m = await member(req); if (!m) { res.status(404).json({ error: "Onboarding required" }); return; }
  const rows = await db.select({ circle: circlesTable }).from(circleMembersTable).innerJoin(circlesTable, eq(circlesTable.id, circleMembersTable.circleId)).where(and(eq(circleMembersTable.memberId, m.id), eq(circleMembersTable.status, "active"), eq(circlesTable.status, "active"))).orderBy(desc(circlesTable.updatedAt));
  res.json(await Promise.all(rows.map(({ circle }) => circleView(circle, m.id))));
});
router.get("/circles/:circleId", async (req, res): Promise<void> => {
  const m = await member(req); const circleId = String(req.params.circleId); const circle = m && (await db.select().from(circlesTable).where(eq(circlesTable.id, circleId)).limit(1))[0];
  if (!m || !circle || !(await activeMembership(db, circleId, m.id))) { res.status(404).json({ error: "Circle not found" }); return; }
  res.json(await circleView(circle, m.id));
});
router.post("/circles/:circleId/invitations", memberRateLimit(20, 60_000, "circle-invite"), async (req, res): Promise<void> => {
  const m = await member(req); const circleId = String(req.params.circleId); const body = z.object({ recipientMemberId: z.string().min(1).max(200), expiresAt: z.string().datetime() }).strict().safeParse(req.body);
  if (!m || !body.success || body.data.recipientMemberId === m.id) { res.status(400).json({ error: "Invalid invitation" }); return; }
  const expiresAt = new Date(body.data.expiresAt); if (expiresAt <= new Date() || expiresAt.getTime() > Date.now() + 31 * 86400_000) { res.status(400).json({ error: "Choose an expiry within 31 days" }); return; }
  const result = await db.transaction(async (tx) => {
    await lockCircleMembers(tx, circleId, m.id, body.data.recipientMemberId);
    const circle = (await tx.select().from(circlesTable).where(eq(circlesTable.id, circleId)).for("update").limit(1))[0];
    const mine = circle && await activeMembership(tx, circleId, m.id);
    const target = (await tx.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.id, body.data.recipientMemberId)).limit(1))[0];
    if (!circle || circle.status !== "active" || !canManage(mine?.role) || !target) return undefined;
    await lockCircleInvitationAuthorization(tx, circleId, body.data.recipientMemberId);
    if (await blockedByAnyMember(tx, circleId, body.data.recipientMemberId)) return undefined;
    if (await activeMembership(tx, circleId, body.data.recipientMemberId)) return null;
    await tx.update(circleInvitationsTable).set({ status: "expired" }).where(and(eq(circleInvitationsTable.circleId, circleId), eq(circleInvitationsTable.recipientMemberId, body.data.recipientMemberId), eq(circleInvitationsTable.status, "pending"), sql`${circleInvitationsTable.expiresAt} <= now()`));
    const existing = (await tx.select().from(circleInvitationsTable).where(and(eq(circleInvitationsTable.circleId, circleId), eq(circleInvitationsTable.recipientMemberId, body.data.recipientMemberId), eq(circleInvitationsTable.status, "pending"))).for("update").limit(1))[0];
    if (existing) return existing;
    const [invite] = await tx.insert(circleInvitationsTable).values({ id: id(), circleId, recipientMemberId: body.data.recipientMemberId, invitedByMemberId: m.id, expiresAt }).returning();
    return invite;
  });
  if (result === undefined) { res.status(404).json({ error: "Circle or member not found" }); return; }
  if (result === null) { res.status(409).json({ error: "Member already belongs to this circle" }); return; }
  await notify(result.recipientMemberId, m.id, "circle_invitation");
  res.status(201).json(result);
});
router.get("/circle-invitations", async (req, res): Promise<void> => {
  const m = await member(req); if (!m) { res.status(404).json({ error: "Onboarding required" }); return; }
  await db.update(circleInvitationsTable).set({ status: "expired" }).where(and(eq(circleInvitationsTable.recipientMemberId, m.id), eq(circleInvitationsTable.status, "pending"), sql`${circleInvitationsTable.expiresAt} <= now()`));
  const rows = await db.select({ invitation: circleInvitationsTable, circle: circlesTable, inviterName: profilesTable.preferredName }).from(circleInvitationsTable).innerJoin(circlesTable, eq(circlesTable.id, circleInvitationsTable.circleId)).leftJoin(profilesTable, eq(profilesTable.memberId, circleInvitationsTable.invitedByMemberId)).where(and(eq(circleInvitationsTable.recipientMemberId, m.id), eq(circleInvitationsTable.status, "pending"), eq(circlesTable.status, "active"))).orderBy(desc(circleInvitationsTable.createdAt));
  res.json(rows.map(({ invitation, circle, inviterName }) => ({ ...invitation, circleName: circle.name, inviterName: inviterName ?? "Member" })));
});
router.post("/circle-invitations/:invitationId/accept", async (req, res): Promise<void> => {
  const m = await member(req); const invitationId = String(req.params.invitationId); if (!m) { res.status(404).json({ error: "Invitation not found" }); return; }
  const result = await db.transaction(async (tx) => {
    const candidate = (await tx.select({ circleId: circleInvitationsTable.circleId }).from(circleInvitationsTable).where(and(eq(circleInvitationsTable.id, invitationId), eq(circleInvitationsTable.recipientMemberId, m.id))).limit(1))[0];
    if (!candidate) return undefined;
    await lockCircleMembers(tx, candidate.circleId, m.id);
    const invitation = (await tx.select().from(circleInvitationsTable).where(and(eq(circleInvitationsTable.id, invitationId), eq(circleInvitationsTable.recipientMemberId, m.id))).for("update").limit(1))[0];
    if (!invitation || invitation.status !== "pending") return undefined;
    const circle = (await tx.select().from(circlesTable).where(eq(circlesTable.id, invitation.circleId)).for("update").limit(1))[0];
    if (!circle || circle.status !== "active") return undefined;
    await lockCircleInvitationAuthorization(tx, invitation.circleId, m.id);
    if (await blockedByAnyMember(tx, invitation.circleId, m.id)) return undefined;
    const [accepted] = await tx.update(circleInvitationsTable).set({ status: "accepted", acceptedAt: sql`now()` }).where(and(eq(circleInvitationsTable.id, invitation.id), eq(circleInvitationsTable.status, "pending"), sql`${circleInvitationsTable.expiresAt} > now()`)).returning();
    if (!accepted) { await tx.update(circleInvitationsTable).set({ status: "expired" }).where(and(eq(circleInvitationsTable.id, invitation.id), eq(circleInvitationsTable.status, "pending"))); return undefined; }
    const [membership] = await tx.insert(circleMembersTable).values({ id: id(), circleId: accepted.circleId, memberId: m.id, invitedByMemberId: accepted.invitedByMemberId, role: "member", joinedAt: accepted.acceptedAt! }).onConflictDoUpdate({ target: [circleMembersTable.circleId, circleMembersTable.memberId], set: { status: "active", role: "member", joinedAt: accepted.acceptedAt!, removedAt: null, invitedByMemberId: accepted.invitedByMemberId } }).returning();
    return { circle, membership, inviter: accepted.invitedByMemberId };
  });
  if (!result) { res.status(404).json({ error: "Invitation is unavailable" }); return; }
  await notify(result.inviter, m.id, "circle_member_joined");
  res.json(await circleView(result.circle, m.id));
});
router.post("/circle-invitations/:invitationId/decline", async (req, res): Promise<void> => {
  const m = await member(req); if (!m) { res.status(404).end(); return; }
  const [row] = await db.update(circleInvitationsTable).set({ status: "declined" }).where(and(eq(circleInvitationsTable.id, String(req.params.invitationId)), eq(circleInvitationsTable.recipientMemberId, m.id), eq(circleInvitationsTable.status, "pending"))).returning();
  if (!row) { res.status(404).json({ error: "Invitation is unavailable" }); return; } res.sendStatus(204);
});
router.patch("/circles/:circleId/members/:memberId", async (req, res): Promise<void> => {
  const m = await member(req); const circleId = String(req.params.circleId); const targetId = String(req.params.memberId); const body = z.object({ role: z.enum(["admin", "member"]) }).strict().safeParse(req.body);
  if (!m || !body.success) { res.status(400).json({ error: "Invalid member role" }); return; }
  const row = await db.transaction(async (tx) => {
    await lockCircleMembers(tx, circleId, m.id, targetId);
    const mine = await activeMembership(tx, circleId, m.id); const target = await activeMembership(tx, circleId, targetId);
    if (mine?.role !== "owner" || !target || targetId === m.id || target.role === "owner") return undefined;
    const [updated] = await tx.update(circleMembersTable).set({ role: body.data.role }).where(eq(circleMembersTable.id, target.id)).returning();
    return updated;
  });
  if (!row) { res.status(404).json({ error: "Circle member not found" }); return; } await notify(targetId, m.id, "circle_role_changed"); res.json({ memberId: row.memberId, role: row.role });
});
router.delete("/circles/:circleId/members/:memberId", async (req, res): Promise<void> => {
  const m = await member(req); const circleId = String(req.params.circleId); const targetId = String(req.params.memberId); if (!m) { res.status(404).end(); return; }
  const row = await db.transaction(async (tx) => {
    await lockCircleMembers(tx, circleId, m.id, targetId);
    const mine = await activeMembership(tx, circleId, m.id); const target = await activeMembership(tx, circleId, targetId);
    if (!canManage(mine?.role) || !target || targetId === m.id || target.role === "owner" || (mine?.role === "admin" && target.role === "admin")) return undefined;
    const [removed] = await tx.update(circleMembersTable).set({ status: "removed", removedAt: new Date() }).where(eq(circleMembersTable.id, target.id)).returning();
    await tx.update(circleHistoryGrantsTable).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(circleHistoryGrantsTable.circleId, circleId), eq(circleHistoryGrantsTable.memberId, targetId), eq(circleHistoryGrantsTable.status, "active")));
    return removed;
  });
  if (!row) { res.status(404).json({ error: "Circle member not found" }); return; } await notify(targetId, m.id, "circle_member_removed"); res.sendStatus(204);
});
router.post("/circles/:circleId/history-access", async (req, res): Promise<void> => {
  const m = await member(req); const circleId = String(req.params.circleId); const body = z.object({ memberId: z.string().min(1).max(200) }).strict().safeParse(req.body);
  if (!m || !body.success) { res.status(400).json({ error: "Invalid history access" }); return; }
  const granted = await db.transaction(async (tx) => {
    await lockCircleMembers(tx, circleId, m.id, body.data.memberId);
    const mine = await activeMembership(tx, circleId, m.id); const target = await activeMembership(tx, circleId, body.data.memberId);
    if (!canManage(mine?.role) || !target) return false;
    await tx.insert(circleHistoryGrantsTable).values({ id: id(), circleId, memberId: body.data.memberId, grantedByMemberId: m.id }).onConflictDoUpdate({ target: [circleHistoryGrantsTable.circleId, circleHistoryGrantsTable.memberId], set: { status: "active", grantedAt: new Date(), revokedAt: null, grantedByMemberId: m.id } });
    return true;
  });
  if (!granted) { res.status(404).json({ error: "Circle member not found" }); return; }
  await notify(body.data.memberId, m.id, "circle_history_shared"); res.sendStatus(204);
});
router.delete("/circles/:circleId/history-access/:memberId", async (req, res): Promise<void> => {
  const m = await member(req); const circleId = String(req.params.circleId); if (!m) { res.status(404).end(); return; }
  const targetId = String(req.params.memberId);
  const revoked = await db.transaction(async (tx) => {
    await lockCircleMembers(tx, circleId, m.id, targetId);
    const mine = await activeMembership(tx, circleId, m.id); if (!canManage(mine?.role)) return false;
    await tx.update(circleHistoryGrantsTable).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(circleHistoryGrantsTable.circleId, circleId), eq(circleHistoryGrantsTable.memberId, targetId), eq(circleHistoryGrantsTable.status, "active")));
    return true;
  });
  if (!revoked) { res.status(404).json({ error: "Circle not found" }); return; } res.sendStatus(204);
});
router.post("/circles/:circleId/leave", async (req, res): Promise<void> => {
  const m = await member(req); const circleId = String(req.params.circleId); if (!m) { res.status(404).end(); return; }
  const result = await db.transaction(async (tx) => {
    await lockCircleMember(tx, circleId, m.id); const mine = await activeMembership(tx, circleId, m.id);
    if (!mine || mine.role === "owner") return false;
    await tx.update(circleMembersTable).set({ status: "left", removedAt: new Date() }).where(eq(circleMembersTable.id, mine.id));
    await tx.update(circleHistoryGrantsTable).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(circleHistoryGrantsTable.circleId, circleId), eq(circleHistoryGrantsTable.memberId, m.id), eq(circleHistoryGrantsTable.status, "active")));
    return true;
  });
  if (!result) { res.status(409).json({ error: "The circle owner must close the circle instead" }); return; } res.sendStatus(204);
});
router.delete("/circles/:circleId", async (req, res): Promise<void> => {
  const m = await member(req); const circleId = String(req.params.circleId); if (!m) { res.status(404).end(); return; }
  const members = await db.transaction(async (tx) => {
    await lockCircleMember(tx, circleId, m.id);
    const circle = (await tx.select().from(circlesTable).where(and(eq(circlesTable.id, circleId), eq(circlesTable.ownerMemberId, m.id), eq(circlesTable.status, "active"))).for("update").limit(1))[0];
    if (!circle) return undefined;
    const active = await tx.select({ memberId: circleMembersTable.memberId }).from(circleMembersTable).where(and(eq(circleMembersTable.circleId, circleId), eq(circleMembersTable.status, "active")));
    await tx.update(circlesTable).set({ status: "closed", closedAt: new Date() }).where(eq(circlesTable.id, circleId)); await tx.update(circleMembersTable).set({ status: "removed", removedAt: new Date() }).where(and(eq(circleMembersTable.circleId, circleId), eq(circleMembersTable.status, "active"))); await tx.update(circleHistoryGrantsTable).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(circleHistoryGrantsTable.circleId, circleId), eq(circleHistoryGrantsTable.status, "active")));
    return active;
  });
  if (!members) { res.status(404).json({ error: "Circle not found" }); return; }
  await Promise.all(members.filter((x) => x.memberId !== m.id).map((x) => notify(x.memberId, m.id, "circle_closed"))); res.sendStatus(204);
});
router.get("/circles/:circleId/posts", async (req, res): Promise<void> => {
  const m = await member(req); const circleId = String(req.params.circleId); if (!m || !(await activeMembership(db, circleId, m.id))) { res.status(404).json({ error: "Circle not found" }); return; }
  const rows = await db.select().from(postsTable).where(and(eq(postsTable.circleId, circleId), eq(postsTable.status, "published"))).orderBy(desc(postsTable.createdAt)).limit(100);
  res.json({ items: (await Promise.all(rows.map((post) => postResponse(post, m.id)))).filter(Boolean), nextCursor: null });
});

export default router;