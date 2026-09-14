import { Router, type Request } from "express";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import {
  db, membersTable, profilesTable, safetyRelationshipsTable, postsTable, reportsTable, moderationRecordsTable,
  groupCategoriesTable, groupsTable, groupMembersTable, groupMembershipRequestsTable, groupResourcesTable,
  groupHostAssignmentsTable, groupWelcomeRequestsTable, communityHostTrainingTable,
  conversationsTable, conversationMembersTable,
  notificationsTable,
} from "@workspace/db";
import { requireAuth, memberRateLimit } from "../middlewares/account-auth";
import { response as postResponse } from "./posts";
import "../lib/groups-deletion-hook";
import { canAccessGroup } from "../lib/group-access";
import { lockGroupAuthority, lockMemberPairs } from "../lib/member-locks";

const router = Router();
router.use("/groups", requireAuth);
router.use("/group-membership-requests", requireAuth);
router.use("/group-reports", requireAuth);
const id = () => randomUUID();
const categories = ["carers", "people-living-with-dementia", "partners", "adult-children", "young-onset-dementia", "dementia-types", "grief", "interests", "countries", "languages"] as const;
type QuerySource = { select: (...args: any[]) => any; insert: (...args: any[]) => any; execute: (query: unknown) => Promise<unknown> };

async function member(req: Request) {
  const clerkUserId = getAuth(req).userId;
  return clerkUserId ? (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, clerkUserId)).limit(1))[0] : undefined;
}
async function ensureCategories(source: QuerySource = db) {
  for (const category of categories) {
    await source.select({ id: groupCategoriesTable.id }).from(groupCategoriesTable).where(eq(groupCategoriesTable.id, category)).limit(1).then(async (rows: any[]) => {
      if (!rows[0]) await source.insert(groupCategoriesTable).values({ id: category, name: category, developmentOnly: true }).onConflictDoNothing();
    });
  }
}
async function membership(groupId: string, memberId: string, source: QuerySource = db) {
  return (await source.select().from(groupMembersTable).where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.memberId, memberId), eq(groupMembersTable.status, "active"))).limit(1))[0];
}
async function group(groupId: string, source: QuerySource = db) {
  return (await source.select().from(groupsTable).where(eq(groupsTable.id, groupId)).limit(1))[0];
}
function manager(role: string | undefined) { return role === "owner" || role === "moderator"; }
async function blocked(a: string, b: string, source: QuerySource = db) {
  return !!(await source.select({ id: safetyRelationshipsTable.id }).from(safetyRelationshipsTable).where(and(eq(safetyRelationshipsTable.kind, "block"), or(and(eq(safetyRelationshipsTable.actorMemberId, a), eq(safetyRelationshipsTable.targetMemberId, b)), and(eq(safetyRelationshipsTable.actorMemberId, b), eq(safetyRelationshipsTable.targetMemberId, a))))).limit(1))[0];
}
async function lockGroupMember(tx: QuerySource, groupId: string, memberId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${groupId + ":" + memberId}, 0))`);
}
async function lockGroupMembers(tx: QuerySource, groupId: string, ...memberIds: string[]) {
  for (const memberId of [...new Set(memberIds)].sort()) await lockGroupMember(tx, groupId, memberId);
}
const WELCOME_AVAILABILITY_TEXTS = [
  "Welcome requests are open when a trained host is available.",
  "Trained hosts are limited; response timing is not provided.",
  "No trained active welcome host is currently available.",
] as const;
const DEFAULT_WELCOME_AVAILABILITY_TEXT = WELCOME_AVAILABILITY_TEXTS[2];
const welcomeAvailabilityTextSchema = z.enum(WELCOME_AVAILABILITY_TEXTS).nullable().optional();
function normalizeWelcomeAvailabilityText(value: string | null | undefined) {
  return value == null ? DEFAULT_WELCOME_AVAILABILITY_TEXT : value;
}
// Host revocation uses the canonical group-member lock and re-reads live
// membership before changing the assignment.
router.delete("/groups/:groupId/hosts/:hostMemberId", async (req, res): Promise<void> => {
  const m = await member(req);
  const groupId = String(req.params.groupId);
  const hostMemberId = String(req.params.hostMemberId);
  if (!m) { res.status(403).end(); return; }
  const rows = await db.transaction(async (tx) => {
    await lockGroupAuthority(tx, groupId);
    await lockGroupMembers(tx, groupId, m.id, hostMemberId);
    const g = await group(groupId, tx);
    const mine = g && await membership(groupId, m.id, tx);
    if (!g || g.status !== "active" || !mine || !manager(mine.role)) return [];
    return tx.update(groupHostAssignmentsTable).set({ active: false, revokedAt: sql`now()` }).where(and(
      eq(groupHostAssignmentsTable.groupId, groupId),
      eq(groupHostAssignmentsTable.hostMemberId, hostMemberId),
      eq(groupHostAssignmentsTable.active, true),
    )).returning();
  });
  if (!rows.length) { res.status(404).end(); return; }
  res.sendStatus(204);
});
router.delete("/groups/:groupId", async (req, res): Promise<void> => {
  const m = await member(req);
  const groupId = String(req.params.groupId);
  if (!m) { res.status(404).json({ error: "Group not found" }); return; }
  const closed = await db.transaction(async (tx) => {
    await lockGroupAuthority(tx, groupId);
    await tx.select({ id: groupsTable.id }).from(groupsTable).where(eq(groupsTable.id, groupId)).for("update").limit(1);
    await lockGroupMember(tx, groupId, m.id);
    const g = await group(groupId, tx);
    const mine = g && await membership(groupId, m.id, tx);
    if (!g || g.status !== "active" || !mine || mine.role !== "owner") return false;
    await tx.update(groupsTable).set({ status: "closed", closedAt: sql`now()` }).where(and(eq(groupsTable.id, groupId), eq(groupsTable.status, "active")));
    await tx.update(groupMembersTable).set({ status: "removed", removedAt: sql`now()` }).where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.status, "active")));
    await tx.delete(notificationsTable).where(sql`${notificationsTable.conversationId} in (select ${conversationsTable.id} from ${conversationsTable} where ${conversationsTable.groupId} = ${groupId})`);
    await tx.update(groupMembershipRequestsTable).set({ status: "cancelled", cancelledAt: sql`now()` }).where(and(eq(groupMembershipRequestsTable.groupId, groupId), eq(groupMembershipRequestsTable.status, "pending")));
    await tx.update(groupHostAssignmentsTable).set({ active: false, revokedAt: sql`now()` }).where(and(eq(groupHostAssignmentsTable.groupId, groupId), eq(groupHostAssignmentsTable.active, true)));
    await tx.update(groupWelcomeRequestsTable).set({ status: "closed", closedAt: sql`now()` }).where(and(eq(groupWelcomeRequestsTable.groupId, groupId), inArray(groupWelcomeRequestsTable.status, ["open", "acknowledged"])));
    return true;
  });
  if (!closed) { res.status(404).json({ error: "Group not found" }); return; }
  res.sendStatus(204);
});
async function groupView(g: typeof groupsTable.$inferSelect, viewerId: string) {
  const rows = await db.select({ member: groupMembersTable, preferredName: profilesTable.preferredName }).from(groupMembersTable).leftJoin(profilesTable, eq(profilesTable.memberId, groupMembersTable.memberId)).where(and(eq(groupMembersTable.groupId, g.id), eq(groupMembersTable.status, "active"))).orderBy(desc(groupMembersTable.role), asc(groupMembersTable.joinedAt));
  const mine = rows.find((r) => r.member.memberId === viewerId)?.member;
  return { ...g, memberCount: rows.length, members: mine ? rows.map(({ member, preferredName }) => ({ memberId: member.memberId, role: member.role, joinedAt: member.joinedAt, preferredName: preferredName ?? "Member", muted: member.muted })) : [], myRole: mine?.role ?? null, myMemberId: mine?.memberId ?? null, myMuted: mine?.muted ?? false };
}
async function canSee(g: typeof groupsTable.$inferSelect, viewerId: string) {
  return canAccessGroup(g.id, viewerId);
}
async function currentHostAuthorization(groupId: string, memberId: string, source: QuerySource = db) {
  const assignment = (await source.select().from(groupHostAssignmentsTable).where(and(eq(groupHostAssignmentsTable.groupId, groupId), eq(groupHostAssignmentsTable.hostMemberId, memberId), eq(groupHostAssignmentsTable.active, true), sql`${groupHostAssignmentsTable.revokedAt} is null`)).limit(1))[0];
  if (!assignment || !(await membership(groupId, memberId, source))) return undefined;
  return (await source.select().from(communityHostTrainingTable).where(and(eq(communityHostTrainingTable.id, assignment.trainingId), eq(communityHostTrainingTable.memberId, memberId), eq(communityHostTrainingTable.active, true), sql`${communityHostTrainingTable.revokedAt} is null`, sql`${communityHostTrainingTable.trainedAt} <= now()`)).limit(1))[0] ? assignment : undefined;
}
async function hasAvailableHost(groupId: string, source: QuerySource = db) {
  const assignments = await source.select().from(groupHostAssignmentsTable).where(and(eq(groupHostAssignmentsTable.groupId, groupId), eq(groupHostAssignmentsTable.active, true), sql`${groupHostAssignmentsTable.revokedAt} is null`));
  for (const assignment of assignments) {
    if (!(await membership(groupId, assignment.hostMemberId, source))) continue;
    const training = (await source.select().from(communityHostTrainingTable).where(and(eq(communityHostTrainingTable.id, assignment.trainingId), eq(communityHostTrainingTable.memberId, assignment.hostMemberId), eq(communityHostTrainingTable.active, true), sql`${communityHostTrainingTable.revokedAt} is null`, sql`${communityHostTrainingTable.trainedAt} <= now()`)).limit(1))[0];
    if (training) return true;
  }
  return false;
}

router.get("/groups/categories", async (_req, res): Promise<void> => {
  await ensureCategories();
  res.json(await db.select().from(groupCategoriesTable).where(eq(groupCategoriesTable.developmentOnly, true)).orderBy(asc(groupCategoriesTable.id)));
});
router.get("/groups", async (req, res): Promise<void> => {
  const m = await member(req); if (!m) { res.status(404).json({ error: "Onboarding required" }); return; }
  await ensureCategories();
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const rows = await db.select().from(groupsTable).where(and(eq(groupsTable.status, "active"), q ? ilike(groupsTable.name, `%${q}%`) : undefined));
  const visible = [];
  for (const g of rows) if (g.discoverability === "public" || await membership(g.id, m.id)) visible.push(await groupView(g, m.id));
  res.json({ items: visible });
});
router.get("/groups/suggestions", async (req, res): Promise<void> => {
  const m = await member(req); if (!m) { res.status(404).json({ error: "Onboarding required" }); return; }
  const profile = (await db.select().from(profilesTable).where(eq(profilesTable.memberId, m.id)).limit(1))[0];
  if (!profile) { res.json([]); return; }
  const choices = new Set([...(profile.roles ?? []), ...(profile.interests ?? []), profile.language ?? "", profile.broadRegion ?? "", profile.dementiaConnection ?? ""].filter(Boolean));
  const rows = await db.select().from(groupsTable).where(and(eq(groupsTable.status, "active"), eq(groupsTable.discoverability, "public")));
  const out = [];
  for (const g of rows) {
    if (await membership(g.id, m.id)) continue;
    const shared = (g.suggestionTags ?? []).filter((tag) => choices.has(tag));
    if (!shared.length && choices.has(g.category)) shared.push(g.category);
    if (shared.length) out.push({ ...g, memberCount: Number((await db.select({ count: sql<number>`count(*)` }).from(groupMembersTable).where(and(eq(groupMembersTable.groupId, g.id), eq(groupMembersTable.status, "active"))))[0]?.count ?? 0), myMemberId: null, myMuted: false, matchedChoices: shared });
  }
  res.json(out.sort((a, b) => b.matchedChoices.length - a.matchedChoices.length || a.id.localeCompare(b.id)).slice(0, 50));
});
router.get("/groups/:groupId", async (req, res): Promise<void> => {
  const m = await member(req); const g = m && await group(String(req.params.groupId));
  if (!m || !g || !(await canSee(g, m.id))) { res.status(404).json({ error: "Group not found" }); return; }
  res.json(await groupView(g, m.id));
});

const groupInput = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(5000).nullable().optional(), category: z.enum(categories), rules: z.string().max(10000).nullable().optional(), suggestionTags: z.array(z.string().max(100)).max(30).default([]), discoverability: z.enum(["public", "private"]).default("public"), contentVisibility: z.enum(["public", "members"]).default("members"), joinPolicy: z.enum(["open", "approval", "closed"]).default("open"), welcomeEnabled: z.boolean().default(false), welcomeAvailabilityText: welcomeAvailabilityTextSchema }).strict();
router.post("/groups", memberRateLimit(10, 60000, "group-mutation"), async (req, res): Promise<void> => {
  const m = await member(req); const parsed = groupInput.safeParse(req.body);
  if (!m || !parsed.success) { res.status(400).json({ error: "Invalid group" }); return; }
  await ensureCategories();
  const welcomeAvailabilityText = normalizeWelcomeAvailabilityText(parsed.data.welcomeAvailabilityText);
  const created = await db.transaction(async (tx) => {
    const [g] = await tx.insert(groupsTable).values({ id: id(), ownerMemberId: m.id, ...parsed.data, welcomeAvailabilityText }).returning();
    await tx.insert(groupMembersTable).values({ id: id(), groupId: g.id, memberId: m.id, role: "owner", joinedAt: sql`now()` });
    return g;
  });
  res.status(201).json(await groupView(created, m.id));
});
router.patch("/groups/:groupId", async (req, res): Promise<void> => {
  const m = await member(req); const groupId = String(req.params.groupId);
  const parsed = z.object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().max(5000).nullable().optional(), rules: z.string().max(10000).nullable().optional(), discoverability: z.enum(["public", "private"]).optional(), contentVisibility: z.enum(["public", "members"]).optional(), joinPolicy: z.enum(["open", "approval", "closed"]).optional(), welcomeEnabled: z.boolean().optional(), welcomeAvailabilityText: welcomeAvailabilityTextSchema, suggestionTags: z.array(z.string().max(100)).max(30).optional() }).strict().safeParse(req.body);
  if (!m || !parsed.success) { res.status(403).json({ error: "Group moderator access required" }); return; }
  const sensitive = ["discoverability", "contentVisibility", "joinPolicy", "welcomeEnabled"] as const;
  const hasWelcomeText = parsed.data.welcomeAvailabilityText !== undefined;
  const welcomeAvailabilityText = hasWelcomeText ? normalizeWelcomeAvailabilityText(parsed.data.welcomeAvailabilityText) : undefined;
  const hasSensitive = sensitive.some((field) => parsed.data[field] !== undefined) || hasWelcomeText;
  const [updated] = await db.transaction(async (tx) => {
    await lockGroupAuthority(tx, groupId);
    await lockGroupMember(tx, groupId, m.id);
    const g = await group(groupId, tx);
    const mine = g && await membership(groupId, m.id, tx);
    if (!g || g.status !== "active" || !mine || !manager(mine.role)) return [];
    if (mine.role !== "owner" && hasSensitive) return [];
    return tx.update(groupsTable).set({ ...parsed.data, ...(hasWelcomeText ? { welcomeAvailabilityText } : {}) }).where(and(eq(groupsTable.id, groupId), eq(groupsTable.status, "active"))).returning();
  });
  if (!updated) { res.status(403).json({ error: hasSensitive ? "Only the group owner may change sensitive group settings" : "Group moderator access required" }); return; }
  res.json(await groupView(updated, m.id));
});

router.post(["/groups/:groupId/join", "/groups/:groupId/membership-requests"], async (req, res): Promise<void> => {
  const m = await member(req); const groupId = String(req.params.groupId);
  if (!m) { res.status(404).json({ error: "Group not found" }); return; }
  const result = await db.transaction(async (tx) => {
    const initialMembers = (await tx.select({ memberId: groupMembersTable.memberId }).from(groupMembersTable).where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.status, "active")))).map((row) => row.memberId);
    await lockMemberPairs(tx, initialMembers.map((memberId) => [m.id, memberId] as const));
    // Serialize every membership change for this group before taking the
    // group-member advisory locks. The second snapshot therefore cannot miss
    // a join which followed the initial, unlocked read.
    await lockGroupAuthority(tx, groupId);
    const lockedGroup = (await tx.select().from(groupsTable).where(eq(groupsTable.id, groupId)).for("update").limit(1))[0];
    if (!lockedGroup || lockedGroup.status !== "active") return undefined;
    const membersAfterGroupLock = (await tx.select({ memberId: groupMembersTable.memberId }).from(groupMembersTable).where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.status, "active")))).map((row) => row.memberId);
    await lockGroupMembers(tx, groupId, m.id, ...membersAfterGroupLock);
    const g = await group(groupId, tx);
    const activeMembers = await tx.select({ memberId: groupMembersTable.memberId }).from(groupMembersTable).where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.status, "active")));
    for (const { memberId } of activeMembers) {
      if (memberId !== m.id && await blocked(memberId, m.id, tx)) return undefined;
    }
    if (!g || g.status !== "active") return undefined;
    if (await membership(groupId, m.id, tx)) return null;
    if (g.joinPolicy === "closed") return "closed" as const;
    if (g.joinPolicy === "approval") {
      const existing = (await tx.select().from(groupMembershipRequestsTable).where(and(eq(groupMembershipRequestsTable.groupId, groupId), eq(groupMembershipRequestsTable.memberId, m.id), eq(groupMembershipRequestsTable.status, "pending"))).limit(1))[0];
      if (existing) return existing;
      const [request] = await tx.insert(groupMembershipRequestsTable).values({ id: id(), groupId, memberId: m.id, status: "pending", requestedAt: sql`now()` }).returning();
      return request;
    }
    const [row] = await tx.insert(groupMembersTable).values({ id: id(), groupId, memberId: m.id, role: "member", status: "active", joinedAt: sql`now()`, leftAt: null, removedAt: null }).onConflictDoUpdate({ target: [groupMembersTable.groupId, groupMembersTable.memberId], set: { status: "active", role: "member", joinedAt: sql`now()`, leftAt: null, removedAt: null } }).returning();
    await tx.update(conversationMembersTable).set({ joinedAt: sql`now()` }).where(and(
      eq(conversationMembersTable.memberId, m.id),
      sql`${conversationMembersTable.conversationId} in (select ${conversationsTable.id} from ${conversationsTable} where ${conversationsTable.groupId} = ${groupId} and ${conversationsTable.status} = 'active')`,
    ));
    return row;
  });
  if (result === undefined) { res.status(404).json({ error: "Group not found" }); return; }
  if (result === "closed") { res.status(403).json({ error: "This group is closed to joining" }); return; }
  if (result === null) { res.status(200).json({ status: "already_member" }); return; }
  res.status("status" in result && result.status === "pending" ? 202 : 200).json(result);
});
router.get("/group-membership-requests", async (req, res): Promise<void> => {
  const m = await member(req); if (!m) { res.status(404).end(); return; }
  res.json(await db.select().from(groupMembershipRequestsTable).where(eq(groupMembershipRequestsTable.memberId, m.id)).orderBy(desc(groupMembershipRequestsTable.requestedAt)));
});
router.get(["/groups/:groupId/requests", "/groups/:groupId/membership-requests"], async (req, res): Promise<void> => {
  const m = await member(req); const g = m && await group(String(req.params.groupId)); const mine = g && m && await membership(g.id, m.id);
  if (!m || !g || !mine || !manager(mine.role)) { res.status(404).json({ error: "Group not found" }); return; }
  res.json(await db.select().from(groupMembershipRequestsTable).where(and(eq(groupMembershipRequestsTable.groupId, g.id), eq(groupMembershipRequestsTable.status, "pending"))).orderBy(asc(groupMembershipRequestsTable.requestedAt)));
});
async function reviewRequest(req: Request, res: any, decision: "approved" | "declined") {
  const m = await member(req); const groupId = String(req.params.groupId); const requestId = String(req.params.requestId);
  const result = await db.transaction(async (tx) => {
    const request = (await tx.select().from(groupMembershipRequestsTable).where(and(eq(groupMembershipRequestsTable.id, requestId), eq(groupMembershipRequestsTable.groupId, groupId), eq(groupMembershipRequestsTable.status, "pending"))).limit(1))[0];
    if (!request) return null;
    if (!m) return undefined;
    const initialMembers = (await tx.select({ memberId: groupMembersTable.memberId }).from(groupMembersTable).where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.status, "active")))).map((row) => row.memberId);
    await lockMemberPairs(tx, initialMembers.map((memberId) => [request.memberId, memberId] as const));
    await lockGroupAuthority(tx, groupId);
    await tx.select({ id: groupsTable.id }).from(groupsTable).where(eq(groupsTable.id, groupId)).for("update").limit(1);
    await lockGroupMembers(tx, groupId, m.id, request.memberId, ...initialMembers);
    const g = await group(groupId, tx); const mine = g && await membership(groupId, m.id, tx);
    if (!g || g.status !== "active" || !mine || !manager(mine.role)) return undefined;
    const activeMembers = await tx.select({ memberId: groupMembersTable.memberId }).from(groupMembersTable).where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.status, "active")));
    const currentRequest = (await tx.select().from(groupMembershipRequestsTable).where(and(eq(groupMembershipRequestsTable.id, requestId), eq(groupMembershipRequestsTable.groupId, groupId), eq(groupMembershipRequestsTable.status, "pending"))).for("update").limit(1))[0];
    if (!currentRequest) return null;
    if (decision === "approved") {
      for (const { memberId } of activeMembers) {
        if (memberId !== currentRequest.memberId && await blocked(currentRequest.memberId, memberId, tx)) return "blocked" as const;
      }
    }
    const [updated] = await tx.update(groupMembershipRequestsTable).set({ status: decision, reviewedByMemberId: m.id, reviewedAt: sql`now()` }).where(eq(groupMembershipRequestsTable.id, currentRequest.id)).returning();
    if (decision === "approved") {
      await tx.insert(groupMembersTable).values({ id: id(), groupId, memberId: currentRequest.memberId, role: "member", joinedAt: sql`now()` }).onConflictDoUpdate({ target: [groupMembersTable.groupId, groupMembersTable.memberId], set: { status: "active", role: "member", joinedAt: sql`now()`, leftAt: null, removedAt: null } });
      await tx.update(conversationMembersTable).set({ joinedAt: sql`now()` }).where(and(
        eq(conversationMembersTable.memberId, currentRequest.memberId),
        sql`${conversationMembersTable.conversationId} in (select ${conversationsTable.id} from ${conversationsTable} where ${conversationsTable.groupId} = ${groupId} and ${conversationsTable.status} = 'active')`,
      ));
    }
    return updated;
  });
  if (result === "blocked") { res.status(409).json({ error: "The applicant is blocked by an active group member" }); return; }
  if (!result) { res.status(404).json({ error: "Membership request not found" }); return; }
  res.json(result);
}
router.post(["/groups/:groupId/requests/:requestId/approve", "/groups/:groupId/membership-requests/:requestId/approve"], (req, res) => reviewRequest(req, res, "approved"));
router.post(["/groups/:groupId/requests/:requestId/decline", "/groups/:groupId/membership-requests/:requestId/decline"], (req, res) => reviewRequest(req, res, "declined"));
router.post("/groups/:groupId/requests/:requestId/cancel", async (req, res): Promise<void> => {
  const m = await member(req); const [row] = m ? await db.transaction(async (tx) => {
    await lockGroupAuthority(tx, String(req.params.groupId));
    return tx.update(groupMembershipRequestsTable).set({ status: "cancelled", cancelledAt: sql`now()` }).where(and(eq(groupMembershipRequestsTable.id, String(req.params.requestId)), eq(groupMembershipRequestsTable.groupId, String(req.params.groupId)), eq(groupMembershipRequestsTable.memberId, m.id), eq(groupMembershipRequestsTable.status, "pending"))).returning();
  }) : [];
  if (!row) { res.status(404).json({ error: "Membership request not found" }); return; } res.json(row);
});

router.post("/groups/:groupId/leave", async (req, res): Promise<void> => {
  const m = await member(req); const groupId = String(req.params.groupId); const result = m && await db.transaction(async (tx) => {
    await lockGroupAuthority(tx, groupId); await lockGroupMember(tx, groupId, m.id); const mine = await membership(groupId, m.id, tx);
    if (!mine || mine.role === "owner") return "owner";
    await tx.update(groupMembersTable).set({ status: "left", leftAt: sql`now()` }).where(eq(groupMembersTable.id, mine.id));
    await tx.delete(notificationsTable).where(and(eq(notificationsTable.recipientMemberId, m.id), sql`${notificationsTable.conversationId} in (select ${conversationsTable.id} from ${conversationsTable} where ${conversationsTable.groupId} = ${groupId})`));
    return "ok";
  });
  if (result !== "ok") { res.status(409).json({ error: result === "owner" ? "The group owner must close the group instead" : "Group membership not found" }); return; } res.json({ status: "left" });
});
router.post("/groups/:groupId/mute", async (req, res): Promise<void> => {
  const m = await member(req); const [row] = m ? await db.transaction(async (tx) => { await lockGroupAuthority(tx, String(req.params.groupId)); return tx.update(groupMembersTable).set({ muted: true, mutedAt: sql`now()` }).where(and(eq(groupMembersTable.groupId, String(req.params.groupId)), eq(groupMembersTable.memberId, m.id), eq(groupMembersTable.status, "active"))).returning(); }) : [];
  if (!row) { res.status(404).json({ error: "Group membership not found" }); return; } res.json(row);
});
router.delete("/groups/:groupId/mute", async (req, res): Promise<void> => {
  const m = await member(req); if (m) await db.transaction(async (tx) => { await lockGroupAuthority(tx, String(req.params.groupId)); await tx.update(groupMembersTable).set({ muted: false, mutedAt: null }).where(and(eq(groupMembersTable.groupId, String(req.params.groupId)), eq(groupMembersTable.memberId, m.id))); }); res.sendStatus(204);
});
router.patch(["/groups/:groupId/members/:memberId/role", "/groups/:groupId/members/:memberId"], async (req, res): Promise<void> => {
  const m = await member(req); const parsed = z.object({ role: z.enum(["moderator", "member"])}).strict().safeParse(req.body); const groupId = String(req.params.groupId); const targetId = String(req.params.memberId);
   const result = m && parsed.success && await db.transaction(async (tx) => { await lockGroupAuthority(tx, groupId); await lockGroupMember(tx, groupId, m.id); await lockGroupMember(tx, groupId, targetId); const mine = await membership(groupId, m.id, tx); const target = await membership(groupId, targetId, tx); if (!mine || mine.role !== "owner" || !target || target.role === "owner" || targetId === m.id) return undefined; return (await tx.update(groupMembersTable).set({ role: parsed.data.role }).where(eq(groupMembersTable.id, target.id)).returning())[0]; });
  if (!result) { res.status(403).json({ error: "Only the group owner may assign ordinary members" }); return; } res.json(result);
});
router.delete("/groups/:groupId/members/:memberId", async (req, res): Promise<void> => {
  const m = await member(req); const groupId = String(req.params.groupId); const targetId = String(req.params.memberId);
   const result = m && await db.transaction(async (tx) => { await lockGroupAuthority(tx, groupId); await lockGroupMember(tx, groupId, m.id); await lockGroupMember(tx, groupId, targetId); const mine = await membership(groupId, m.id, tx); const target = await membership(groupId, targetId, tx); if (!mine || !manager(mine.role) || !target || targetId === m.id || target.role === "owner" || (mine.role === "moderator" && target.role === "moderator")) return undefined; const row = (await tx.update(groupMembersTable).set({ status: "removed", removedAt: sql`now()` }).where(eq(groupMembersTable.id, target.id)).returning())[0]; await tx.delete(notificationsTable).where(and(eq(notificationsTable.recipientMemberId, targetId), sql`${notificationsTable.conversationId} in (select ${conversationsTable.id} from ${conversationsTable} where ${conversationsTable.groupId} = ${groupId})`)); return row; });
  if (!result) { res.status(403).json({ error: "Member cannot be removed by this moderator" }); return; } res.sendStatus(204);
});
const resourceInput = z.object({ url: z.string().url().max(2000), title: z.string().trim().min(1).max(200), description: z.string().max(2000).nullable().optional(), pinOrder: z.number().int().min(0).default(0) }).strict();
router.get("/groups/:groupId/resources", async (req, res): Promise<void> => { const m = await member(req); const g = m && await group(String(req.params.groupId)); if (!m || !g || !(await canSee(g, m.id)) || (g.contentVisibility === "members" && !(await membership(g.id, m.id)))) { res.status(404).end(); return; } res.json(await db.select().from(groupResourcesTable).where(eq(groupResourcesTable.groupId, g.id)).orderBy(asc(groupResourcesTable.pinOrder), asc(groupResourcesTable.createdAt))); });
router.post("/groups/:groupId/resources", async (req, res): Promise<void> => {
  const m = await member(req); const p = resourceInput.safeParse(req.body); const groupId = String(req.params.groupId);
  if (!m || !p.success) { res.status(403).json({ error: "Group moderator access required" }); return; }
  const [r] = await db.transaction(async (tx) => {
    await lockGroupMember(tx, groupId, m.id);
    const g = await group(groupId, tx); const mine = g && await membership(groupId, m.id, tx);
    if (!g || g.status !== "active" || !mine || !manager(mine.role)) return [];
    return tx.insert(groupResourcesTable).values({ id: id(), groupId, createdByMemberId: m.id, ...p.data }).returning();
  });
  if (!r) { res.status(403).json({ error: "Group moderator access required" }); return; }
  res.status(201).json(r);
});
router.delete("/groups/:groupId/resources/:resourceId", async (req, res): Promise<void> => {
  const m = await member(req); const groupId = String(req.params.groupId);
  if (!m) { res.status(403).end(); return; }
  const deleted = await db.transaction(async (tx) => {
    await lockGroupMember(tx, groupId, m.id);
    const g = await group(groupId, tx); const mine = g && await membership(groupId, m.id, tx);
    if (!g || g.status !== "active" || !mine || !manager(mine.role)) return [];
    return tx.delete(groupResourcesTable).where(and(eq(groupResourcesTable.id, String(req.params.resourceId)), eq(groupResourcesTable.groupId, groupId))).returning();
  });
  if (!deleted.length) { res.status(404).end(); return; } res.sendStatus(204);
});

// Keep authorization and the assignment write under the same canonical locks.
router.post("/groups/:groupId/hosts", async (req, res, next): Promise<void> => {
  const m = await member(req); const p = z.object({ hostMemberId: z.string().min(1) }).strict().safeParse(req.body); const groupId = String(req.params.groupId);
  if (!m || !p.success) { next(); return; }
  const result = await db.transaction(async (tx) => {
    await lockGroupMembers(tx, groupId, m.id, p.data.hostMemberId);
    const g = await group(groupId, tx); const mine = g && await membership(groupId, m.id, tx); const host = g && await membership(groupId, p.data.hostMemberId, tx);
    if (!g || g.status !== "active" || !mine || !manager(mine.role)) return { kind: "forbidden" as const };
    if (!host) return { kind: "not_member" as const };
    const training = (await tx.select().from(communityHostTrainingTable).where(and(eq(communityHostTrainingTable.memberId, host.memberId), eq(communityHostTrainingTable.active, true), sql`${communityHostTrainingTable.revokedAt} is null`, sql`${communityHostTrainingTable.trainedAt} <= now()`)).orderBy(desc(communityHostTrainingTable.trainedAt)).limit(1))[0];
    if (!training) return { kind: "untrained" as const };
    const [row] = await tx.insert(groupHostAssignmentsTable).values({ id: id(), groupId, hostMemberId: host.memberId, assignedByMemberId: m.id, trainingId: training.id, trainedAt: training.trainedAt, active: true, revokedAt: null }).onConflictDoUpdate({ target: [groupHostAssignmentsTable.groupId, groupHostAssignmentsTable.hostMemberId], set: { assignedByMemberId: m.id, trainingId: training.id, trainedAt: training.trainedAt, active: true, revokedAt: null } }).returning();
    return { kind: "ok" as const, row };
  });
  if (result.kind === "forbidden") { res.status(403).json({ error: "Group host assignment requires the owner or moderator" }); return; }
  if (result.kind === "not_member") { res.status(400).json({ error: "Host must be an active member of this group" }); return; }
  if (result.kind === "untrained") { res.status(409).json({ error: "Host requires an active independent community training record" }); return; }
  res.status(201).json(result.row);
});
router.get("/groups/:groupId/hosts", async (req, res): Promise<void> => { const m = await member(req); const g = m && await group(String(req.params.groupId)); const mine = g && m && await membership(g.id, m.id); if (!m || !g || !mine || !manager(mine.role)) { res.status(403).json({ error: "Group moderator access required" }); return; } res.json(await db.select().from(groupHostAssignmentsTable).where(eq(groupHostAssignmentsTable.groupId, g.id)).orderBy(desc(groupHostAssignmentsTable.createdAt))); });
router.post("/groups/:groupId/welcome/:requestId/acknowledge", async (req, res): Promise<void> => {
  const m = await member(req); const groupId = String(req.params.groupId); const requestId = String(req.params.requestId);
  if (!m) { res.status(403).end(); return; }
  const row = await db.transaction(async (tx) => {
    await lockGroupMember(tx, groupId, m.id);
    const g = await group(groupId, tx); const assignment = g && await currentHostAuthorization(groupId, m.id, tx);
    if (!g || g.status !== "active" || !assignment) return undefined;
    return (await tx.update(groupWelcomeRequestsTable).set({ status: "acknowledged", acknowledgedByMemberId: m.id, acknowledgedAt: sql`now()` }).where(and(eq(groupWelcomeRequestsTable.id, requestId), eq(groupWelcomeRequestsTable.groupId, groupId), eq(groupWelcomeRequestsTable.status, "open"))).returning())[0];
  });
  if (!row) { res.status(404).end(); return; }
  res.json({ id: row.id, status: row.status, acknowledgedAt: row.acknowledgedAt });
});
router.post("/groups/:groupId/welcome/:requestId/close", async (req, res): Promise<void> => {
  const m = await member(req); const groupId = String(req.params.groupId); const requestId = String(req.params.requestId);
  if (!m) { res.status(403).end(); return; }
  const row = await db.transaction(async (tx) => {
    await lockGroupMember(tx, groupId, m.id);
    const g = await group(groupId, tx); const assignment = g && await currentHostAuthorization(groupId, m.id, tx);
    if (!g || g.status !== "active" || !assignment) return undefined;
    return (await tx.update(groupWelcomeRequestsTable).set({ status: "closed", closedAt: sql`now()` }).where(and(eq(groupWelcomeRequestsTable.id, requestId), eq(groupWelcomeRequestsTable.groupId, groupId), inArray(groupWelcomeRequestsTable.status, ["open", "acknowledged"]))).returning())[0];
  });
  if (!row) { res.status(404).end(); return; }
  res.json({ id: row.id, status: row.status, closedAt: row.closedAt });
});
router.get("/groups/:groupId/welcome", async (req, res): Promise<void> => {
  const m = await member(req);
  const groupId = String(req.params.groupId);
  const result = m && await db.transaction(async (tx) => {
    // Lock the host and every requester before re-reading authorization. This
    // is the same group-member order used by host deactivation/removal.
    const initialRequesters = (await tx.select({ memberId: groupWelcomeRequestsTable.memberId })
      .from(groupWelcomeRequestsTable)
      .where(and(eq(groupWelcomeRequestsTable.groupId, groupId), inArray(groupWelcomeRequestsTable.status, ["open", "acknowledged"])))).map((row) => row.memberId);
    await lockGroupMembers(tx, groupId, m.id, ...initialRequesters);
    const g = await group(groupId, tx);
    if (!g || g.status !== "active") return undefined;
    const [assignment] = await tx.select().from(groupHostAssignmentsTable).where(and(
      eq(groupHostAssignmentsTable.groupId, groupId),
      eq(groupHostAssignmentsTable.hostMemberId, m.id),
      eq(groupHostAssignmentsTable.active, true),
      sql`${groupHostAssignmentsTable.revokedAt} is null`,
    )).for("update").limit(1);
    if (!assignment) return undefined;
    const [training] = await tx.select().from(communityHostTrainingTable).where(and(
      eq(communityHostTrainingTable.id, assignment.trainingId),
      eq(communityHostTrainingTable.memberId, m.id),
      eq(communityHostTrainingTable.active, true),
      sql`${communityHostTrainingTable.revokedAt} is null`,
      sql`${communityHostTrainingTable.trainedAt} <= now()`,
    )).for("update").limit(1);
    const hostMembership = await membership(groupId, m.id, tx);
    if (!training || !hostMembership) return undefined;
    const rows = await tx.select({ request: groupWelcomeRequestsTable, requesterPreferredName: profilesTable.preferredName })
      .from(groupWelcomeRequestsTable)
      .innerJoin(groupMembersTable, and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.memberId, groupWelcomeRequestsTable.memberId), eq(groupMembersTable.status, "active")))
      .leftJoin(profilesTable, eq(profilesTable.memberId, groupWelcomeRequestsTable.memberId))
      .where(and(eq(groupWelcomeRequestsTable.groupId, groupId), inArray(groupWelcomeRequestsTable.status, ["open", "acknowledged"])))
      .orderBy(asc(groupWelcomeRequestsTable.requestedAt));
    return rows.map(({ request, requesterPreferredName }) => ({ ...request, requesterPreferredName: requesterPreferredName ?? "Member" }));
  });
  if (!result) { res.status(403).json({ error: "Only an active trained host assigned to this group may access its welcome queue" }); return; }
  res.json(result);
});
router.get("/groups/:groupId/welcome/me", async (req, res): Promise<void> => { const m = await member(req); const groupId = String(req.params.groupId); if (!m || !(await group(groupId)) || !(await membership(groupId, m.id))) { res.status(404).json({ error: "Group membership not found" }); return; } const row = (await db.select().from(groupWelcomeRequestsTable).where(and(eq(groupWelcomeRequestsTable.groupId, groupId), eq(groupWelcomeRequestsTable.memberId, m.id))).orderBy(desc(groupWelcomeRequestsTable.requestedAt)).limit(1))[0]; res.json(row ? { requestId: row.id, status: row.status, requestedAt: row.requestedAt, acknowledgedAt: row.acknowledgedAt, closedAt: row.closedAt } : { requestId: null, status: "none", requestedAt: null, acknowledgedAt: null, closedAt: null }); });
router.post("/groups/:groupId/welcome", async (req, res): Promise<void> => { const m = await member(req); const groupId = String(req.params.groupId); const p = z.object({ introductionText: z.string().max(5000).nullable().optional() }).strict().safeParse(req.body); const result = m && p.success && await db.transaction(async (tx) => { await lockGroupMember(tx, groupId, m.id); const g = await group(groupId, tx); if (!g || g.status !== "active" || !(await membership(groupId, m.id, tx)) || !g.welcomeEnabled) return { kind: "unavailable" as const, message: "Welcome workflow is unavailable for this group" }; const existing = (await tx.select().from(groupWelcomeRequestsTable).where(and(eq(groupWelcomeRequestsTable.groupId, groupId), eq(groupWelcomeRequestsTable.memberId, m.id), inArray(groupWelcomeRequestsTable.status, ["open", "acknowledged"]))).orderBy(desc(groupWelcomeRequestsTable.requestedAt)).limit(1))[0]; if (existing) return { kind: "existing" as const, row: existing }; if (!(await hasAvailableHost(groupId, tx))) return { kind: "unavailable" as const, message: g.welcomeAvailabilityText ?? "No trained active welcome host is currently available" }; const [row] = await tx.insert(groupWelcomeRequestsTable).values({ id: id(), groupId, memberId: m.id, introductionText: p.data.introductionText }).returning(); return { kind: "created" as const, row }; }); if (!result) { res.status(409).json({ error: "Welcome workflow is unavailable for this group" }); return; } if (result.kind === "unavailable") { res.status(409).json({ error: result.message }); return; } if (result.kind === "existing") { res.status(409).json({ error: "A welcome request is already open", request: result.row }); return; } res.status(201).json(result.row); });

router.post("/groups/:groupId/reports", async (req, res): Promise<void> => {
  const m = await member(req);
  const p = z.object({ category: z.enum(["harassment", "threats", "exploitation", "scams", "impersonation", "hateful_content", "dangerous_medical_claims", "distress_disclosure", "respectful_disagreement"]), details: z.string().max(5000).optional() }).strict().safeParse(req.body);
  const groupId = String(req.params.groupId);
  if (!m || !p.success) { res.status(404).json({ error: "Group not found" }); return; }
  const result = await db.transaction(async (tx) => {
    await lockGroupMember(tx, groupId, m.id);
    const g = await group(groupId, tx);
    if (!g || g.status !== "active" || !(await canAccessGroup(groupId, m.id, tx))) return undefined;
    const [report] = await tx.insert(reportsTable).values({ id: id(), reporterMemberId: m.id, groupId, category: p.data.category, details: p.data.details }).returning();
    const [moderation] = await tx.insert(moderationRecordsTable).values({ id: id(), reportId: report.id, subjectMemberId: g.ownerMemberId, state: "pending" }).returning();
    return { report, moderation };
  });
  if (!result) { res.status(404).json({ error: "Group not found" }); return; }
  res.status(201).json({ report: result.report, moderationRecord: result.moderation });
});
router.get("/groups/:groupId/posts", async (req, res): Promise<void> => { const m = await member(req); const g = m && await group(String(req.params.groupId)); if (!m || !g || !(await canSee(g, m.id))) { res.status(404).end(); return; } const rows = await db.select().from(postsTable).where(and(eq(postsTable.groupId, g.id), eq(postsTable.audience, "this_group"), eq(postsTable.status, "published"))).orderBy(desc(postsTable.createdAt)).limit(100); res.json({ items: (await Promise.all(rows.map((p) => postResponse(p, m.id)))).filter(Boolean), nextCursor: null }); });
export default router;