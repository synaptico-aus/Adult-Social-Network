import { Router, type IRouter, type Request, type Response } from "express";
import { requireStaffCapability, requireStaffMfa } from "../middlewares/staff-auth";
import { STAFF_ROLE_CAPABILITIES, roleHasCapability } from "../lib/staff-policy";
import { db, appealsTable, evidenceAccessAuditTable, moderationRecordsTable, reportsTable, sensitiveActionAuditTable, staffRoleAssignmentsTable, verificationRequestsTable } from "@workspace/db";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { canTransitionModeration, urgentCategory } from "../lib/moderation-policy";

const router: IRouter = Router();
router.get("/staff/capabilities", requireStaffMfa, async (req: Request, res: Response): Promise<void> => {
  const actor = getAuth(req).userId!;
  const assignment = (await db.select().from(staffRoleAssignmentsTable).where(and(eq(staffRoleAssignmentsTable.clerkUserId, actor), eq(staffRoleAssignmentsTable.active, true))).limit(1))[0];
  if (!assignment) { res.status(403).json({ error: "Staff assignment is required" }); return; }
  const capabilities = assignment.capabilities.length ? assignment.capabilities : STAFF_ROLE_CAPABILITIES[assignment.role] ?? [];
  res.json({ role: assignment.role, capabilities, tools: capabilities.map((capability) => ({ capability, enabled: roleHasCapability(assignment.role, capability, assignment.capabilities) })) });
});
router.get("/staff/tools", requireStaffCapability("moderation.queue"), (_req: Request, res: Response): void => { res.json({ enabled: true, message: "Staff tools are server-authorized." }); });
router.get("/staff/verification-requests", requireStaffCapability("verification.review"), async (_req: Request, res: Response): Promise<void> => {
  res.json(await db.select().from(verificationRequestsTable).orderBy(desc(verificationRequestsTable.createdAt)));
});
router.patch("/staff/verification-requests/:id", requireStaffCapability("verification.review"), async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({ status: z.enum(["approved", "rejected"]) }).safeParse(req.body);
  const actor = getAuth(req).userId;
  if (!parsed.success || !actor) { res.status(400).json({ error: "Invalid review" }); return; }
  const request = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(verificationRequestsTable).where(eq(verificationRequestsTable.id, String(req.params.id))).limit(1);
    if (!before || before.status !== "pending") return null;
    const [updated] = await tx.update(verificationRequestsTable).set({ status: parsed.data.status, reviewedAt: new Date(), reviewedBy: actor }).where(and(eq(verificationRequestsTable.id, before.id), eq(verificationRequestsTable.status, "pending"))).returning();
    if (!updated) return null;
    await tx.insert(sensitiveActionAuditTable).values({ id: randomUUID(), actorClerkUserId: actor, action: "verification.review", subjectId: updated.id, metadata: { priorState: before.status, newState: updated.status, outcome: "updated" } });
    return updated;
  });
  if (!request) { res.status(404).json({ error: "Verification request not found" }); return; }
  res.json(request);
});
router.get("/staff/moderation/queue", requireStaffCapability("moderation.queue"), async (_req: Request, res: Response): Promise<void> => {
  res.json(await db.select({ reportId: reportsTable.id, category: reportsTable.category, reportStatus: reportsTable.status, reportCreatedAt: reportsTable.createdAt, moderationRecordId: moderationRecordsTable.id, moderationState: moderationRecordsTable.state }).from(reportsTable).innerJoin(moderationRecordsTable, eq(moderationRecordsTable.reportId, reportsTable.id)).where(eq(moderationRecordsTable.state, "pending")).orderBy(desc(reportsTable.createdAt)));
});
router.get("/staff/moderation/urgent", requireStaffCapability("moderation.urgent"), async (_req: Request, res: Response): Promise<void> => {
  res.json(await db.select({ reportId: reportsTable.id, category: reportsTable.category, reportStatus: reportsTable.status, reportCreatedAt: reportsTable.createdAt, moderationRecordId: moderationRecordsTable.id, moderationState: moderationRecordsTable.state }).from(reportsTable).innerJoin(moderationRecordsTable, eq(moderationRecordsTable.reportId, reportsTable.id)).where(and(eq(moderationRecordsTable.state, "pending"), inArray(reportsTable.category, ["threats", "exploitation", "distress_disclosure"]))).orderBy(desc(reportsTable.createdAt)));
});
router.post("/staff/evidence/:evidenceId/access", requireStaffCapability("evidence.read"), async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({ reason: z.string().trim().min(1).max(1000) }).strict().safeParse(req.body);
  const actor = getAuth(req).userId;
  if (!parsed.success || !actor) { res.status(400).json({ error: "A specific access reason is required" }); return; }
  const evidenceId = String(req.params.evidenceId);
  const report = (await db.select().from(reportsTable).where(or(eq(reportsTable.id, evidenceId), eq(reportsTable.contentId, evidenceId))).limit(1))[0];
  if (!report) { res.status(404).json({ error: "Evidence is not associated with a report" }); return; }
  await db.insert(evidenceAccessAuditTable).values({ id: randomUUID(), actorClerkUserId: actor, evidenceId: report.id, reason: parsed.data.reason });
  res.json({ allowed: true, report });
});
router.post("/staff/moderation/:id/decision", requireStaffCapability("moderation.decide"), async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({ state: z.enum(["pending", "allowed", "held", "removed", "appealed"]), decision: z.string().optional(), sanction: z.string().optional(), reason: z.string().min(1) }).strict().safeParse(req.body);
  const actor = getAuth(req).userId;
  if (!parsed.success || !actor) { res.status(400).json({ error: "Invalid moderation decision" }); return; }
  const result = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(moderationRecordsTable).where(eq(moderationRecordsTable.id, String(req.params.id))).limit(1);
    if (!before || !canTransitionModeration(before.state, parsed.data.state)) return null;
    const [record] = await tx.update(moderationRecordsTable).set({ ...parsed.data, decidedBy: actor }).where(eq(moderationRecordsTable.id, before.id)).returning();
    await tx.update(reportsTable).set({ status: parsed.data.state }).where(eq(reportsTable.id, before.reportId!));
    await tx.insert(sensitiveActionAuditTable).values({ id: randomUUID(), actorClerkUserId: actor, action: "moderation.decision", subjectId: record.id, metadata: { priorState: before.state, newState: record.state, reason: parsed.data.reason, outcome: "updated" } });
    return record;
  });
  if (!result) { res.status(409).json({ error: "Moderation state transition is not allowed" }); return; }
  const record = result;
  res.json(record);
});
router.get("/staff/appeals", requireStaffCapability("appeals.review"), async (_req: Request, res: Response): Promise<void> => { res.json(await db.select().from(appealsTable).where(eq(appealsTable.status, "pending")).orderBy(desc(appealsTable.createdAt))); });
router.patch("/staff/appeals/:id", requireStaffCapability("appeals.review"), async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({ status: z.enum(["allowed", "removed"]), reason: z.string().trim().min(1) }).strict().safeParse(req.body);
  const actor = getAuth(req).userId;
  if (!parsed.success || !actor) { res.status(400).json({ error: "Invalid appeal decision" }); return; }
  const appeal = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(appealsTable).where(eq(appealsTable.id, String(req.params.id))).limit(1);
    if (!before || before.status !== "pending") return null;
    const [updated] = await tx.update(appealsTable).set({ status: parsed.data.status, reviewedBy: actor, reviewedAt: new Date() }).where(and(eq(appealsTable.id, before.id), eq(appealsTable.status, "pending"))).returning();
    if (!updated) return null;
    await tx.update(moderationRecordsTable).set({ state: parsed.data.status }).where(and(eq(moderationRecordsTable.id, before.moderationRecordId), eq(moderationRecordsTable.state, "appealed")));
    const [record] = await tx.select({ reportId: moderationRecordsTable.reportId }).from(moderationRecordsTable).where(eq(moderationRecordsTable.id, before.moderationRecordId)).limit(1);
    if (record?.reportId) await tx.update(reportsTable).set({ status: parsed.data.status }).where(eq(reportsTable.id, record.reportId));
    await tx.insert(sensitiveActionAuditTable).values({ id: randomUUID(), actorClerkUserId: actor, action: "appeal.review", subjectId: updated.id, metadata: { priorState: before.status, newState: updated.status, reason: parsed.data.reason, outcome: "updated" } });
    return updated;
  });
  if (!appeal) { res.status(409).json({ error: "Appeal was already reviewed or unavailable" }); return; }
  res.json(appeal);
});
export default router;