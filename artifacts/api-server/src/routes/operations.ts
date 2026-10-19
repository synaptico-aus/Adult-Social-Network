import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, announcementsTable, deletionRequestsTable, deletionStepsTable, dutySessionsTable, featureControlsTable, groupsTable, membersTable, moderationRecordsTable, deviceRegistrationsTable, operationsRecordsTable, reportsTable, sensitiveActionAuditTable, serviceMeasurementsTable, staffRoleAssignmentsTable, staffRoles } from "@workspace/db";
import { requireAuth, memberRateLimit } from "../middlewares/account-auth";
import { requireStaffMfa } from "../middlewares/staff-auth";
import { STAFF_ROLE_CAPABILITIES, roleHasCapability } from "../lib/staff-policy";
import { budgetDefaults, controlKeys, featureEnabled } from "../lib/operations-policy";
import { releaseHold } from "../lib/release-holds";
import { operationalMetrics } from "../lib/operations-metrics";
import { executeDeletion } from "../lib/deletion-workflow";
import { recordHumanResponse } from "../lib/operations-data";
import { logger } from "../lib/logger";

const router = Router();
const sectionCapabilities: Record<string, string> = { users: "users.manage", groups: "groups.manage", access: "staff.roles", coverage: "operations.manage", incidents: "operations.manage", security: "operations.manage", launch: "operations.manage", processors: "privacy.manage", budgets: "operations.manage", deletions: "privacy.manage", announcements: "announcements.manage", audit: "audit.read", alerts: "operations.read" };
const actions: Record<string, [string, string]> = {
  assign_role: ["access", "staff.roles"], review_access: ["access", "staff.roles"], revoke_access: ["access", "staff.roles"],
  suspend_user: ["users", "users.manage"], restore_user: ["users", "users.manage"],
  suspend_group: ["groups", "groups.manage"], restore_group: ["groups", "groups.manage"],
  create_announcement: ["announcements", "announcements.manage"], publish_announcement: ["announcements", "announcements.manage"], withdraw_announcement: ["announcements", "announcements.manage"],
  start_shift: ["coverage", "moderation.queue"], heartbeat: ["coverage", "moderation.queue"], end_shift: ["coverage", "moderation.queue"],
  set_staffing_hours: ["coverage", "operations.manage"], record_incident: ["incidents", "operations.manage"], resolve_incident: ["incidents", "operations.manage"],
  record_security_report: ["security", "operations.manage"], resolve_security_report: ["security", "operations.manage"],
  record_launch_review: ["launch", "operations.manage"], record_processor_evidence: ["processors", "privacy.manage"],
  set_budget: ["budgets", "operations.manage"], set_control: ["budgets", "operations.manage"],
  record_cost: ["budgets", "operations.manage"],
  acknowledge_alert: ["alerts", "operations.read"], retry_deletion: ["deletions", "privacy.manage"], acknowledge_report: ["incidents", "moderation.queue"],
};
async function assignment(req: Request) {
  return (await db.select().from(staffRoleAssignmentsTable).where(and(eq(staffRoleAssignmentsTable.clerkUserId, getAuth(req).userId!), eq(staffRoleAssignmentsTable.active, true))))[0]!;
}
const permits = (a: Awaited<ReturnType<typeof assignment>>, c: string) => roleHasCapability(a.role, c, a.capabilities);
const allowed = (a: Awaited<ReturnType<typeof assignment>>, section: string) => Object.entries(actions).filter(([, [s, c]]) => s === section && permits(a, c)).map(([key]) => key);
const record = (id: string, title: string, status: string, summary: string, createdAt: Date, rowActions: string[] = []) => ({ id, title, status, summary, createdAt: createdAt.toISOString(), actions: rowActions });

router.use("/staff/ops", requireStaffMfa, (_req: Request, res: Response, next: NextFunction) => { res.set("Cache-Control", "private, no-store"); next(); });
router.get("/staff/ops", async (req, res) => {
  const a = await assignment(req), operational = permits(a, "operations.read") || permits(a, "operations.manage");
  const metrics = operational && !a.groupIds.length ? await operationalMetrics() : [];
  const features = operational ? await Promise.all(controlKeys.map(async key => ({ key, enabled: await featureEnabled(key), reason: releaseHold(key) ?? (await db.select().from(featureControlsTable).where(eq(featureControlsTable.key, key)))[0]?.reason ?? "Default policy; analytics is off until deliberately enabled." }))) : [];
  const modules = Object.entries(sectionCapabilities).filter(([, cap]) => permits(a, cap)).map(([key]) => ({ key, label: key.replace(/_/g, " "), path: `/staff/operations?section=${key}` }));
  for (const [cap, key, label, path] of [
    ["moderation.queue", "reports", "Reports and appeals", "/staff/moderation"],
    ["education.author", "education", "Education", "/staff/education"],
    ["resources.manage", "resources", "Resources", "/staff/resources"],
    ["education.review", "translations", "Translations", "/staff/translations"],
  ]) if (permits(a, cap)) modules.push({ key, label, path });
  if (permits(a, "moderation.queue") && !modules.some(m => m.key === "coverage")) modules.push({ key: "coverage", label: "Duty check-in", path: "/staff/operations?section=coverage" });
  const checks = [];
  if (operational) for (const region of ["AU", "GB", "US"]) for (const key of ["privacy_legal", "age_assurance", "sustainability", "backup_restore", "rollback", "staffing"]) {
    const [r] = await db.select().from(operationsRecordsTable).where(and(eq(operationsRecordsTable.kind, "launch"), eq(operationsRecordsTable.targetId, key), eq(operationsRecordsTable.region, region))).orderBy(desc(operationsRecordsTable.createdAt)).limit(1);
    checks.push({ key: `${region}:${key}`, status: r?.status === "reviewed" && r.validUntil && r.validUntil > new Date() ? "recorded_review" : "blocked", note: r ? `${r.note} Evidence: ${r.reference ?? "missing"}; this is an operator-attested review, not independent certification.` : "No qualified review evidence recorded; not launch-approved." });
  }
  res.json({ role: a.role, capabilities: (a.capabilities.length ? a.capabilities : STAFF_ROLE_CAPABILITIES[a.role]).filter(c => permits(a, c)), metrics, features, modules, checks, staffingNotice: "No confirmed 24/7 moderation. Duty heartbeats measure sampled session presence, not active attention or response guarantees. Refer to declared hours and measured human responses.", updatedAt: new Date().toISOString() });
});
router.get("/staff/ops/records/:section", async (req, res) => {
  const a = await assignment(req), section = String(req.params.section), cap = sectionCapabilities[section];
  if (!cap || (!permits(a, cap) && !(section === "coverage" && permits(a, "moderation.queue")))) { res.status(403).json({ error: "This staff scope does not permit this section" }); return; }
  let items: ReturnType<typeof record>[] = [];
  if (section === "users") {
    if (a.groupIds.length) { res.status(403).json({ error: "Group-scoped staff cannot browse global users" }); return; }
    const restrictions = await db.select().from(operationsRecordsTable).where(and(eq(operationsRecordsTable.kind, "user_restrictions"), eq(operationsRecordsTable.status, "active")));
    items = (await db.select().from(membersTable).orderBy(desc(membersTable.createdAt)).limit(100)).map(m => {
      const restricted = restrictions.some(r => r.targetId === m.id);
      return record(m.id, `Member ${m.id}`, m.deletedAt ? "deletion_in_progress" : restricted ? "write_restricted" : m.active ? "active" : "inactive", "No private profile, health details, email or message text is exposed here. Write restrictions preserve reading, appeals and data rights.", m.createdAt, m.deletedAt ? [] : restricted || !m.active ? ["restore_user"] : ["suspend_user"]);
    });
  } else if (section === "groups") {
    const rows = await db.select().from(groupsTable).where(a.groupIds.length ? inArray(groupsTable.id, a.groupIds) : undefined).orderBy(desc(groupsTable.createdAt)).limit(100);
    items = rows.map(g => record(g.id, `Group ${g.id}`, g.status, "Operational state only; staff access does not grant reading private group content.", g.createdAt, g.status === "active" ? ["suspend_group"] : ["restore_group"]));
  } else if (section === "access") {
    const rows = await db.select().from(staffRoleAssignmentsTable).orderBy(desc(staffRoleAssignmentsTable.createdAt)).limit(100);
    items = rows.map(s => record(s.id, s.clerkUserId, s.active ? "active" : "revoked", `Role: ${s.role}; capabilities: ${s.capabilities.join(", ") || "role defaults"}; groups: ${s.groupIds.join(", ") || "unscoped"}; initial grant is not an independent review. Review due within 30 days.`, s.createdAt, s.clerkUserId === a.clerkUserId ? [] : ["review_access", "revoke_access"]));
  } else if (section === "deletions") {
    const rows = await db.select().from(deletionRequestsTable).orderBy(desc(deletionRequestsTable.requestedAt)).limit(100);
    for (const r of rows) { const steps = await db.select().from(deletionStepsTable).where(eq(deletionStepsTable.requestId, r.id));
      items.push(record(r.id, `Deletion ${r.id}`, r.status, `${steps.map(s => `${s.module}: ${s.status}`).join("; ")} ${r.lastError ?? ""}`, r.requestedAt, r.status === "pending" ? ["retry_deletion"] : [])); }
  } else if (section === "announcements") {
    items = (await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt)).limit(100)).map(r => record(r.id, r.title, r.status, `${r.body}\nRegion ${r.region}; expires ${r.expiresAt.toISOString()}; author ${r.authorClerkUserId}`, r.createdAt, r.status === "draft" && r.authorClerkUserId !== a.clerkUserId ? ["publish_announcement", "withdraw_announcement"] : r.status !== "withdrawn" ? ["withdraw_announcement"] : []));
  } else if (section === "audit") {
    items = (await db.select().from(sensitiveActionAuditTable).orderBy(desc(sensitiveActionAuditTable.occurredAt)).limit(100)).map(r => record(r.id, r.action, "recorded", `Actor ${r.actorClerkUserId}; subject ${r.subjectId ?? "none"}. Sensitive evidence/reasons are not analytics.`, r.occurredAt));
  } else {
    const rows = await db.select().from(operationsRecordsTable).where(eq(operationsRecordsTable.kind, section)).orderBy(desc(operationsRecordsTable.createdAt)).limit(100);
    items = rows.map(r => record(r.id, r.title, r.status, `${r.note}${r.reference ? ` Evidence: ${r.reference}` : ""}${r.numericValue != null ? ` Value: ${r.numericValue}` : ""}${r.validUntil ? ` Review expires: ${r.validUntil.toISOString()}` : ""}`, r.createdAt, section === "incidents" && r.status === "open" ? ["resolve_incident"] : section === "security" && r.status === "open" ? ["resolve_security_report"] : section === "alerts" && r.status === "open" ? ["acknowledge_alert"] : []));
    if (section === "coverage") {
      const sessions = await db.select().from(dutySessionsTable).where(permits(a, "operations.manage") ? undefined : eq(dutySessionsTable.actorClerkUserId, a.clerkUserId)).orderBy(desc(dutySessionsTable.startedAt)).limit(50);
      items.unshift(...sessions.map(s => record(s.id, `Duty session ${s.id}`, s.endedAt ? "ended" : s.heartbeatAt.getTime() > Date.now() - 90000 ? "recent_presence" : "lapsed", `${s.observedSeconds} sampled staff-seconds; last heartbeat ${s.heartbeatAt.toISOString()}; not active attention or guaranteed coverage.`, s.startedAt, s.actorClerkUserId === a.clerkUserId && !s.endedAt ? ["end_shift"] : [])));
    }
  }
  const allowedActions = allowed(a, section);
  res.json({ section, items: items.map(i => ({ ...i, actions: i.actions.filter(x => allowedActions.includes(x)) })), allowedActions });
});

const command = z.object({
  action: z.enum(Object.keys(actions) as [string, ...string[]]), reason: z.string().trim().min(10).max(2000),
  targetId: z.string().min(1).max(200).optional(), title: z.string().trim().min(1).max(180).optional(), body: z.string().trim().max(5000).optional(),
  role: z.enum(staffRoles).optional(), capabilities: z.array(z.string().max(80)).max(30).optional(), groupIds: z.array(z.string().max(200)).max(100).optional(),
  numericValue: z.number().finite().nonnegative().optional(), enabled: z.boolean().optional(), region: z.enum(["AU", "GB", "US"]).optional(),
  validUntil: z.string().datetime().optional(), reference: z.string().trim().min(1).max(400).optional(), requestId: z.string().max(200).optional(),
  status: z.enum(["pending", "reviewed", "blocked", "verified"]).optional(),
}).strict();
class OpsError extends Error { constructor(public code: number, message: string) { super(message); } }
function need(condition: unknown, message: string, code = 400): asserts condition { if (!condition) throw new OpsError(code, message); }
router.post("/staff/ops/commands", memberRateLimit(90, 60000, "ops-command"), async (req, res) => {
  try {
    const parsed = command.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid operational command; use the documented fields only" }); return; }
    const d = parsed.data, a = await assignment(req), actor = a.clerkUserId;
    need(permits(a, actions[d.action][1]), "Staff capability does not permit this command", 403);
    const id = await db.transaction(async tx => {
      const target = d.targetId, until = d.validUntil ? new Date(d.validUntil) : null;
      let resultId: string = randomUUID();
      const add = async (kind: string, title: string, status = "recorded", targetId = target) => {
        await tx.insert(operationsRecordsTable).values({ id: resultId, kind, targetId, title, status, note: d.reason + (d.body ? `\n${d.body}` : ""), reference: d.reference, region: d.region, numericValue: d.numericValue, validUntil: until, actorClerkUserId: actor });
      };
      if (d.action === "assign_role") {
        need(target && d.role && target !== actor, "Assign an existing different member and a valid role");
        const [member] = await tx.select().from(membersTable).where(and(eq(membersTable.clerkUserId, target), eq(membersTable.active, true)));
        need(member, "An active onboarded member is required", 404);
        need(!d.capabilities?.some(c => !STAFF_ROLE_CAPABILITIES[d.role!].includes(c)), "Capabilities must narrow the role, not add privileges");
        need(!d.groupIds?.length || ["moderator", "group_manager"].includes(d.role), "Only moderator/group manager assignments support group scopes");
        await tx.insert(staffRoleAssignmentsTable).values({ id: resultId, clerkUserId: target, role: d.role, capabilities: d.capabilities ?? [], groupIds: d.groupIds ?? [], assignedBy: actor }).onConflictDoUpdate({ target: staffRoleAssignmentsTable.clerkUserId, set: { role: d.role, capabilities: d.capabilities ?? [], groupIds: d.groupIds ?? [], active: true, assignedBy: actor, createdAt: new Date() } });
      } else if (d.action === "review_access" || d.action === "revoke_access") {
        const [s] = await tx.select().from(staffRoleAssignmentsTable).where(eq(staffRoleAssignmentsTable.id, target ?? "")).for("update");
        need(s && s.clerkUserId !== actor, "Access review/revocation requires a different assignee", 403);
        if (d.action === "revoke_access") await tx.update(staffRoleAssignmentsTable).set({ active: false }).where(eq(staffRoleAssignmentsTable.id, s.id));
        else { need(until && until > new Date() && until.getTime() <= Date.now() + 30 * 86400000, "Access review needs an expiry within 30 days"); }
        await add("access", `Access ${s.role}`, d.action === "review_access" ? "reviewed" : "revoked", s.id);
      } else if (d.action === "suspend_user" || d.action === "restore_user") {
        need(!a.groupIds.length, "Scoped staff cannot change global users", 403);
        const [m] = await tx.select().from(membersTable).where(eq(membersTable.id, target ?? "")).for("update");
        need(m && m.clerkUserId !== actor && !m.deletedAt, "Cannot change yourself, a deleted account or an unknown member", 409);
        if (d.action === "suspend_user") {
          await add("user_restrictions", "Service content-write restriction", "active", m.id);
          await tx.insert(moderationRecordsTable).values({ id: resultId, subjectMemberId: m.id, state: "held", sanction: "suspension", decidedBy: actor, reason: d.reason });
          await tx.update(deviceRegistrationsTable).set({ active: false, revokedAt: new Date() }).where(eq(deviceRegistrationsTable.memberId, m.id));
        } else {
          const restrictions = await tx.update(operationsRecordsTable).set({ status: "resolved" }).where(and(eq(operationsRecordsTable.kind, "user_restrictions"), eq(operationsRecordsTable.targetId, m.id), eq(operationsRecordsTable.status, "active"))).returning();
          if (restrictions.length) await tx.update(moderationRecordsTable).set({ state: "allowed" }).where(inArray(moderationRecordsTable.id, restrictions.map(r => r.id)));
          await tx.update(membersTable).set({ active: true }).where(eq(membersTable.id, m.id));
        }
      } else if (d.action === "suspend_group" || d.action === "restore_group") {
        need(target && (!a.groupIds.length || a.groupIds.includes(target)), "Group is outside this staff assignment", 403);
        const [group] = await tx.select().from(groupsTable).where(eq(groupsTable.id, target)).for("update");
        need(group, "Group not found", 404);
        if (d.action === "suspend_group") {
          need(group.status === "active", "An already closed group cannot be suspended again", 409);
          const closedAt = new Date();
          await tx.update(groupsTable).set({ status: "closed", closedAt }).where(eq(groupsTable.id, target));
          await add("group_restrictions", closedAt.toISOString(), "active", target);
        } else {
          const [checkpoint] = await tx.select().from(operationsRecordsTable).where(and(eq(operationsRecordsTable.kind, "group_restrictions"), eq(operationsRecordsTable.targetId, target), eq(operationsRecordsTable.status, "active"))).orderBy(desc(operationsRecordsTable.createdAt)).limit(1);
          const [owner] = await tx.select().from(membersTable).where(eq(membersTable.id, group.ownerMemberId));
          need(owner?.active && !owner.deletedAt && checkpoint && group.closedAt?.toISOString() === checkpoint.title, "Only the unchanged staff suspension of an active owner's group can be restored", 409);
          await tx.update(groupsTable).set({ status: "active", closedAt: null }).where(eq(groupsTable.id, target));
          await tx.update(operationsRecordsTable).set({ status: "resolved" }).where(eq(operationsRecordsTable.id, checkpoint.id));
        }
        resultId = target;
      } else if (d.action === "create_announcement") {
        need(d.title && d.body && d.region && until && until > new Date() && until.getTime() <= Date.now() + 90 * 86400000, "Service announcement requires title/body/region and expiry within 90 days");
        await tx.insert(announcementsTable).values({ id: resultId, title: d.title, body: d.body, region: d.region, authorClerkUserId: actor, expiresAt: until });
      } else if (d.action === "publish_announcement" || d.action === "withdraw_announcement") {
        const [r] = await tx.select().from(announcementsTable).where(eq(announcementsTable.id, target ?? "")).for("update");
        need(r && (d.action === "withdraw_announcement" || (r.status === "draft" && r.authorClerkUserId !== actor && r.expiresAt > new Date())), "A different staff reviewer must publish an unexpired draft", 409);
        await tx.update(announcementsTable).set({ status: d.action === "publish_announcement" ? "published" : "withdrawn", ...(d.action === "publish_announcement" ? { publishedBy: actor, publishedAt: new Date() } : {}) }).where(eq(announcementsTable.id, r.id)); resultId = r.id;
      } else if (d.action === "start_shift") {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${actor},1))`);
        const open = await tx.select().from(dutySessionsTable).where(and(eq(dutySessionsTable.actorClerkUserId, actor), isNull(dutySessionsTable.endedAt))).for("update");
        need(!open.some(s => s.heartbeatAt.getTime() > Date.now() - 90000), "End your current active duty session first", 409);
        await tx.update(dutySessionsTable).set({ endedAt: new Date() }).where(and(eq(dutySessionsTable.actorClerkUserId, actor), isNull(dutySessionsTable.endedAt)));
        await tx.insert(dutySessionsTable).values({ id: resultId, actorClerkUserId: actor });
      } else if (d.action === "heartbeat" || d.action === "end_shift") {
        const [s] = await tx.select().from(dutySessionsTable).where(eq(dutySessionsTable.id, target ?? "")).for("update");
        need(s && s.actorClerkUserId === actor && !s.endedAt, "Own active duty session required", 403);
        const elapsed = Math.floor((Date.now() - s.heartbeatAt.getTime()) / 1000);
        await tx.update(dutySessionsTable).set({ heartbeatAt: new Date(), observedSeconds: s.observedSeconds + (elapsed >= 0 && elapsed <= 90 ? elapsed : 0), ...(d.action === "end_shift" ? { endedAt: new Date() } : {}) }).where(eq(dutySessionsTable.id, s.id)); resultId = s.id;
      } else if (d.action === "set_control") {
        need(target && controlKeys.includes(target as typeof controlKeys[number]) && d.enabled !== undefined, "Known feature and enabled/disabled state required");
        need(!d.enabled || !releaseHold(target!), releaseHold(target!) ?? "Release safety hold", 409);
        await tx.insert(featureControlsTable).values({ key: target, enabled: d.enabled, reason: d.reason, updatedBy: actor }).onConflictDoUpdate({ target: featureControlsTable.key, set: { enabled: d.enabled, reason: d.reason, updatedBy: actor, updatedAt: new Date() } }); resultId = target;
      } else if (d.action === "record_cost") {
        need(["upload_processing", "storage", "hosting"].includes(d.targetId ?? "") && d.numericValue != null && d.numericValue >= 0 && d.numericValue <= 1e9 && d.reference, "Actual USD cost and a provider statement reference are required; never enter payment credentials");
        resultId = `cost:${new Date().toISOString().slice(0, 7)}:${d.targetId}`;
        await tx.insert(operationsRecordsTable).values({ id: resultId, kind: "costs", targetId: d.targetId, title: d.targetId!, note: d.reason, numericValue: d.numericValue, reference: d.reference, status: "operator_attested", actorClerkUserId: actor })
          .onConflictDoUpdate({ target: operationsRecordsTable.id, set: { numericValue: d.numericValue, reference: d.reference, note: d.reason, actorClerkUserId: actor, createdAt: new Date() } });
      } else if (d.action === "set_budget") {
        need(target && target in budgetDefaults && d.numericValue !== undefined, "Known budget key and numeric threshold required");
        await add("budgets", target, "active");
      } else if (d.action === "record_launch_review") {
        need(target && ["privacy_legal", "age_assurance", "sustainability", "backup_restore", "rollback", "staffing"].includes(target) && d.region && d.status, "Known launch area, region and review state required");
        need(d.status !== "reviewed" || (d.reference && until && until > new Date()), "A reviewed launch area needs qualified evidence/reference and future review expiry");
        await add("launch", d.title ?? target, d.status);
      } else if (d.action === "record_processor_evidence") {
        need(target && ["clerk", "storage", "database_backups", "logs", "evidence_retention"].includes(target), "Known processor required");
        need(d.status !== "verified" || (d.requestId && d.reference && until && until > new Date()), "Verified erasure/retention needs a specific deletion request ID, evidence and review expiry");
        if (d.requestId) need((await tx.select().from(deletionRequestsTable).where(eq(deletionRequestsTable.id, d.requestId))).length, "Deletion request not found", 404);
        await add("processors", target, d.status ?? "pending", d.requestId ?? target);
      } else if (d.action === "retry_deletion") {
        need(target && (await tx.select().from(deletionRequestsTable).where(and(eq(deletionRequestsTable.id, target), eq(deletionRequestsTable.status, "pending")))).length, "Pending deletion required", 404); resultId = target;
        await tx.update(deletionStepsTable).set({ attempts: 0 }).where(and(eq(deletionStepsTable.requestId, target), sql`${deletionStepsTable.status} <> 'completed'`));
      } else if (d.action === "acknowledge_report") {
        const [r] = await tx.select().from(reportsTable).where(eq(reportsTable.id, target ?? ""));
        need(r && (!a.groupIds.length || (r.groupId && a.groupIds.includes(r.groupId))), "Report is outside your scope", 403); resultId = r.id;
      } else if (["resolve_incident", "resolve_security_report", "acknowledge_alert"].includes(d.action)) {
        const kind = d.action === "resolve_incident" ? "incidents" : d.action === "resolve_security_report" ? "security" : "alerts";
        const rows = await tx.update(operationsRecordsTable).set({ status: "resolved" }).where(and(eq(operationsRecordsTable.id, target ?? ""), eq(operationsRecordsTable.kind, kind))).returning();
        need(rows.length, "Record not found", 404); resultId = rows[0].id;
      } else {
        const kind = d.action === "record_incident" ? "incidents" : d.action === "record_security_report" ? "security" : "coverage";
        need(d.title, "A non-sensitive title is required"); await add(kind, d.title, kind === "coverage" ? "declared_not_measured" : "open");
      }
      await tx.insert(sensitiveActionAuditTable).values({ id: randomUUID(), actorClerkUserId: actor, action: `ops.${d.action}`, subjectId: resultId, metadata: { reason: d.reason, outcome: "recorded", targetId: d.targetId, requestId: d.requestId, role: d.role, capabilities: d.capabilities, groupIds: d.groupIds, numericValue: d.numericValue, enabled: d.enabled, status: d.status, region: d.region, validUntil: d.validUntil, reference: d.reference } });
      return resultId;
    });
    if (d.action === "retry_deletion") await executeDeletion(id, true);
    if (d.action === "acknowledge_report") await recordHumanResponse("report", id, actor);
    res.json({ id, status: "recorded" });
  } catch (e) { if (e instanceof OpsError) res.status(e.code).json({ error: e.message }); else { logger.error("Operational command failed"); res.status(500).json({ error: "Command did not complete; check operational status before retrying" }); } }
});

router.get("/announcements", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const region = z.enum(["AU", "GB", "US"]).safeParse(req.query.region);
  if (!region.success) { res.status(400).json({ error: "Choose a supported region" }); return; }
  if (!(await featureEnabled("announcements"))) { res.json([]); return; }
  const rows = await db.select().from(announcementsTable).where(and(eq(announcementsTable.status, "published"), eq(announcementsTable.region, region.data), gt(announcementsTable.expiresAt, new Date())));
  res.json(rows.map(({ id, title, body, region: r, publishedAt, sponsorshipDisclosure }) => ({ id, title, body, region: r, publishedAt, sponsorshipDisclosure })));
});
router.get("/service-policy", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  const hours = await db.select().from(operationsRecordsTable).where(eq(operationsRecordsTable.kind, "coverage")).orderBy(desc(operationsRecordsTable.createdAt)).limit(10);
  res.json({
    staffingNotice: "No confirmed 24/7 moderation. Me is not an emergency service, does not monitor emergencies or dispatch help. Automated receipts and staff-page heartbeats are not human responses.",
    declaredHours: hours.length ? hours.map(h => `${h.region ?? "Service"}: ${h.title}`) : ["No staffed moderation hours have been confirmed; do not rely on an immediate reply."],
    measurementEnabled: await featureEnabled("analytics"),
    privacyNotice: "Optional feedback uses yes/no answers, task codes, durations and completion flags only. No private text, health details, messages or advertising profiles. No private health data is monetised; no payments or sponsored placements are currently enabled.",
    backupNotice: "Live access ends immediately on deletion. Cleanup may remain pending for storage, provider erasure, verified backup expiry and justified evidence retention. Actual backup retention/expiry is not yet verified; no fixed expiry is promised. Offline copies already seen or saved cannot be remotely recalled.",
  });
});
router.post("/security-reports", memberRateLimit(3, 3600000, "security-report"), async (req, res) => {
  const p = z.object({ title: z.string().trim().min(5).max(180), summary: z.string().trim().min(20).max(5000) }).strict().safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Give a short title and safe reproduction summary; never include credentials or private health data." }); return; }
  const id = randomUUID();
  await db.insert(operationsRecordsTable).values({ id, kind: "security", title: p.data.title, note: p.data.summary, status: "open", actorClerkUserId: getAuth(req).userId ?? "anonymous" });
  res.set("Cache-Control", "no-store").json({ id, status: "received_not_human_reviewed" });
});
async function feedbackMember(req: Request) { return (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, getAuth(req).userId!)))[0]; }
router.post("/service-feedback", requireAuth, memberRateLimit(3, 86400000, "supported-feedback"), async (req, res) => {
  const parsed = z.object({ consent: z.literal(true), supported: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Explicit consent and a yes/no response only; private text is not accepted" }); return; }
  if (!(await featureEnabled("analytics"))) { res.status(503).json({ error: "Optional service measurement is currently paused" }); return; }
  const member = await feedbackMember(req); if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const id = randomUUID();
  await db.insert(serviceMeasurementsTable).values({ id, memberId: member.id, kind: "supported", value: parsed.data.supported ? 1 : 0 });
  res.json({ id, status: "recorded" });
});
router.post("/service-tasks", requireAuth, memberRateLimit(10, 86400000, "service-task"), async (req, res) => {
  const parsed = z.object({ consent: z.literal(true), task: z.enum(["find_support", "change_language", "save_draft", "export_account", "report_content"]), completed: z.boolean(), usedAssistiveTechnology: z.boolean(), durationSeconds: z.number().finite().min(0).max(86400) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Only consented task codes, duration and completion flags are accepted; no private text" }); return; }
  if (!(await featureEnabled("analytics"))) { res.status(503).json({ error: "Optional service measurement is currently paused" }); return; }
  const member = await feedbackMember(req); if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const id = randomUUID(), d = parsed.data;
  await db.transaction(async tx => {
    await tx.insert(serviceMeasurementsTable).values({ id, memberId: member.id, kind: "task_completed", task: d.task, value: d.completed ? 1 : 0 });
    await tx.insert(serviceMeasurementsTable).values({ id: randomUUID(), memberId: member.id, kind: "task_seconds", task: d.task, value: d.durationSeconds });
    if (d.usedAssistiveTechnology) await tx.insert(serviceMeasurementsTable).values({ id: randomUUID(), memberId: member.id, kind: "assistive_task_completed", task: d.task, value: d.completed ? 1 : 0 });
  });
  res.json({ id, status: "recorded" });
});
export default router;
