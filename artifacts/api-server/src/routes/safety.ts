import { Router, type Request } from "express";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, appealsTable, membersTable, moderationRecordsTable, reportsTable, safetyRelationshipsTable, friendRequestsTable, friendshipsTable, followsTable } from "@workspace/db";
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
router.get("/safety/relationships", async (req, res): Promise<void> => {
  const member = await memberFor(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  res.json(await db.select().from(safetyRelationshipsTable).where(eq(safetyRelationshipsTable.actorMemberId, member.id)).orderBy(desc(safetyRelationshipsTable.createdAt)));
});
const relationshipInput = z.object({ targetMemberId: z.string().min(1) }).strict();
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
  await db.delete(safetyRelationshipsTable).where(and(eq(safetyRelationshipsTable.actorMemberId, member.id), eq(safetyRelationshipsTable.targetMemberId, String(req.params.targetMemberId)), eq(safetyRelationshipsTable.kind, kind.data)));
  res.sendStatus(204);
});

router.post("/reports", async (req, res): Promise<void> => {
  const member = await memberFor(req);
  const parsed = z.object({ targetMemberId: z.string().optional(), contentId: z.string().optional(), category: z.enum(["harassment", "threats", "exploitation", "scams", "impersonation", "hateful_content", "dangerous_medical_claims", "distress_disclosure", "respectful_disagreement"]), details: z.string().max(5000).optional() }).strict().safeParse(req.body);
  if (!member || !parsed.success) { res.status(400).json({ error: "Invalid report" }); return; }
  if (parsed.data.targetMemberId === member.id) { res.status(400).json({ error: "You cannot report yourself" }); return; }
  if (parsed.data.targetMemberId && !(await db.select({ id: membersTable.id }).from(membersTable).where(eq(membersTable.id, parsed.data.targetMemberId)).limit(1))[0]) { res.status(400).json({ error: "Target member not found" }); return; }
  const [report, moderation] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(reportsTable).values({ id: randomUUID(), reporterMemberId: member.id, ...parsed.data }).returning();
    const [record] = await tx.insert(moderationRecordsTable).values({ id: randomUUID(), reportId: created.id, contentId: created.contentId, subjectMemberId: created.targetMemberId, state: "pending" }).returning();
    return [created, record] as const;
  });
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