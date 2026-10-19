import type { RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { and, eq, inArray } from "drizzle-orm";
import { db, staffRoleAssignmentsTable, reportsTable, moderationRecordsTable, appealsTable, retainedEvidenceTable } from "@workspace/db";

/** A group-scoped moderator is not a global investigator or private-media reviewer. */
export const staffScopeGate: RequestHandler = async (req, res, next) => {
  if (!req.path.startsWith("/staff/")) { next(); return; }
  const user = getAuth(req).userId;
  if (!user) { next(); return; }
  const [a] = await db.select().from(staffRoleAssignmentsTable).where(and(eq(staffRoleAssignmentsTable.clerkUserId, user), eq(staffRoleAssignmentsTable.active, true)));
  if (!a?.groupIds.length || /^\/staff\/(?:ops|capabilities|tools)(?:\/|$)/.test(req.path)) { next(); return; }
  const reports = await db.select().from(reportsTable).where(inArray(reportsTable.groupId, a.groupIds));
  const reportIds = new Set(reports.map(r => r.id));
  const records = reportIds.size ? await db.select().from(moderationRecordsTable).where(inArray(moderationRecordsTable.reportId, [...reportIds])) : [];
  const recordIds = new Set(records.map(r => r.id));
  const send = res.json.bind(res);
  if (/^\/staff\/moderation\/(?:queue|urgent)$/.test(req.path)) {
    res.json = body => send(Array.isArray(body) ? body.filter(r => reportIds.has(r.reportId)) : body); next(); return;
  }
  if (req.path === "/staff/appeals") {
    res.json = body => send(Array.isArray(body) ? body.filter(r => recordIds.has(r.moderationRecordId)) : body); next(); return;
  }
  const decision = req.path.match(/^\/staff\/moderation\/([^/]+)\/decision$/);
  const message = req.path.match(/^\/staff\/reports\/([^/]+)\/message-evidence$/);
  if ((decision && recordIds.has(decision[1])) || (message && reportIds.has(message[1]))) { next(); return; }
  const appeal = req.path.match(/^\/staff\/appeals\/([^/]+)$/);
  if (appeal) {
    const [r] = await db.select().from(appealsTable).where(eq(appealsTable.id, appeal[1]));
    if (r && recordIds.has(r.moderationRecordId)) { next(); return; }
  }
  const evidence = req.path.match(/^\/staff\/evidence\/([^/]+)\/access$/);
  if (evidence) {
    const [e] = await db.select().from(retainedEvidenceTable).where(eq(retainedEvidenceTable.id, evidence[1]));
    if ((e && reportIds.has(e.reportId)) || reportIds.has(evidence[1]) || reports.some(r => r.contentId === evidence[1])) { next(); return; }
  }
  res.status(403).json({ error: "This record is outside your assigned group scope" });
};
