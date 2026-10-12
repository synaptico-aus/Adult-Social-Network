import { Router, type IRouter, type RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, membersTable, resourcesTable, resourceReportsTable, resourceEventsTable } from "@workspace/db";
import {
  CreateResourceBody, UpdateResourceBody, PreviewResourceBody, ReviewResourceBody,
  RemoveResourceBody, ReportResourceBody, ResolveResourceReportBody,
} from "@workspace/api-zod";
import { requireAuth, memberRateLimit } from "../middlewares/account-auth";
import { requireStaffCapability, requireStaffEducationRead } from "../middlewares/staff-auth";
import { authorisedEmbed, extractMetadata, plainMetadata, resourceUrl, safeResourceFetch } from "../lib/safe-resource-fetch";
import "../lib/resource-deletion-hook";

const router: IRouter = Router();
type ResourceRow = typeof resourcesTable.$inferSelect;
const month = 30 * 86400000;
const text = (s: string, max: number) => plainMetadata(s, max);
const isStale = (row: ResourceRow) => !row.lastCheckedAt || Date.now() - row.lastCheckedAt.getTime() > month;
function output(row: ResourceRow) {
  const stale = isStale(row);
  return {
    id: row.id, url: row.url, domain: row.domain, title: row.title,
    category: row.category, region: row.region, sourceDate: row.sourceDate,
    preview: row.preview, previewPermission: row.previewPermission,
    embedAuthorized: row.embedAuthorized,
    embedUrl: row.status === "reviewed" && row.linkState === "reachable" && !stale ? authorisedEmbed(row.url, row.embedAuthorized) : null,
    status: row.status, reviewedBy: row.reviewedBy, reviewedAt: row.reviewedAt,
    lastCheckedAt: row.lastCheckedAt, linkState: row.linkState, stale,
    removalReason: row.removalReason,
  };
}
function reportOutput(row: typeof resourceReportsTable.$inferSelect) {
  return { id: row.id, resourceId: row.resourceId, reason: row.reason, status: row.status, resolution: row.resolution, createdAt: row.createdAt };
}
function input(data: typeof CreateResourceBody._output) {
  const url = resourceUrl(data.url);
  const title = text(data.title, 200);
  const region = text(data.region, 100);
  const preview = text(data.preview, 300);
  const previewPermission = text(data.previewPermission, 500);
  if (!title || !region || (preview && !previewPermission)) throw new Error("Title, region and permission/original-summary provenance are required");
  if (data.embedAuthorized && !authorisedEmbed(url.href, true)) throw new Error("This provider supports external links only");
  return { url: url.href, domain: url.hostname, title, region, category: data.category,
    preview, previewPermission, embedAuthorized: data.embedAuthorized,
    sourceDate: data.sourceDate ? new Date(data.sourceDate) : null };
}
// No anonymous preview proxy. Bound work globally and per staff identity.
let activeFetches = 0;
const quotas = new Map<string, { since: number; count: number }>();
const networkQuota: RequestHandler = (req, res, next) => {
  const now = Date.now();
  for (const [id, quota] of quotas) if (now - quota.since > 60000) quotas.delete(id);
  const id = getAuth(req).userId!;
  const quota = quotas.get(id) ?? { since: now, count: 0 };
  quota.count++;
  quotas.set(id, quota);
  if (quota.count > 10 || activeFetches >= 4) { res.status(429).json({ error: "External link check limit; try again shortly" }); return; }
  next();
};
async function external(raw: string, metadata: boolean) {
  if (activeFetches >= 4) throw new Error("External fetch capacity exceeded");
  activeFetches++;
  try { return await safeResourceFetch(raw, metadata); } finally { activeFetches--; }
}

router.get("/resources", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 200) : "";
  const category = typeof req.query.category === "string" ? req.query.category : "";
  const region = typeof req.query.region === "string" ? req.query.region.slice(0, 100) : "";
  const rows = await db.select().from(resourcesTable).where(and(
    eq(resourcesTable.status, "reviewed"),
    q ? or(ilike(resourcesTable.title, `%${q}%`), ilike(resourcesTable.domain, `%${q}%`), ilike(resourcesTable.preview, `%${q}%`)) : undefined,
    category ? eq(resourcesTable.category, category) : undefined,
    region ? ilike(resourcesTable.region, `%${region}%`) : undefined,
  )).orderBy(desc(resourcesTable.reviewedAt)).limit(100);
  res.set("Cache-Control", "no-store").json({ items: rows.map(output) });
});
router.get("/resources/:id", async (req, res): Promise<void> => {
  const row = (await db.select().from(resourcesTable).where(and(eq(resourcesTable.id, String(req.params.id)), eq(resourcesTable.status, "reviewed"))).limit(1))[0];
  if (!row) { res.status(404).json({ error: "Resource unavailable" }); return; }
  res.set("Cache-Control", "no-store").json(output(row));
});
router.post("/resources/:id/reports", requireAuth, memberRateLimit(10, 60000, "resource-reports"), async (req, res): Promise<void> => {
  const parsed = ReportResourceBody.strict().safeParse(req.body);
  if (!parsed.success || !text(parsed.data.reason, 1000)) { res.status(400).json({ error: "A report reason is required" }); return; }
  const member = (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, getAuth(req).userId!)).limit(1))[0];
  if (!member?.active) { res.status(403).json({ error: "Active membership required" }); return; }
  const id = String(req.params.id);
  const row = (await db.select().from(resourcesTable).where(and(eq(resourcesTable.id, id), eq(resourcesTable.status, "reviewed"))).limit(1))[0];
  if (!row) { res.status(404).json({ error: "Resource unavailable" }); return; }
  const existing = await db.select().from(resourceReportsTable).where(and(eq(resourceReportsTable.resourceId, id), eq(resourceReportsTable.memberId, member.id), eq(resourceReportsTable.status, "open"))).limit(1);
  if (existing.length) { res.status(409).json({ error: "Your report is already awaiting review" }); return; }
  const [report] = await db.insert(resourceReportsTable).values({ id: randomUUID(), resourceId: id, memberId: member.id, reason: text(parsed.data.reason, 1000) }).returning();
  res.status(201).json(reportOutput(report));
});
router.get("/staff/resources", ...requireStaffEducationRead, async (_req, res): Promise<void> => {
  const rows = await db.select().from(resourcesTable).orderBy(desc(resourcesTable.updatedAt)).limit(200);
  res.set("Cache-Control", "no-store").json({ items: rows.map(output) });
});
router.post("/staff/resources/preview", ...requireStaffCapability("education.author"), networkQuota, async (req, res): Promise<void> => {
  const parsed = PreviewResourceBody.strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid URL" }); return; }
  try {
    const result = await external(parsed.data.url, true);
    res.json({ url: result.url, domain: result.domain, ...extractMetadata(result.html) });
  } catch { res.status(400).json({ error: "Preview refused: unsafe, oversized, unsupported or unreachable destination" }); }
});
router.post("/staff/resources", ...requireStaffCapability("education.author"), async (req, res): Promise<void> => {
  const parsed = CreateResourceBody.strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid resource fields" }); return; }
  try {
    const values = input(parsed.data);
    const row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(resourcesTable).values({ id: randomUUID(), ...values, editorId: getAuth(req).userId! }).returning();
      await tx.insert(resourceEventsTable).values({ id: randomUUID(), resourceId: created.id, actorId: getAuth(req).userId!, action: "create", note: "Draft external link" });
      return created;
    });
    res.status(201).json(output(row));
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Invalid resource" }); }
});
router.patch("/staff/resources/:id", ...requireStaffCapability("education.author"), async (req, res): Promise<void> => {
  const parsed = UpdateResourceBody.strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid resource fields" }); return; }
  let values: ReturnType<typeof input>;
  try { values = input(parsed.data); } catch { res.status(400).json({ error: "Invalid URL, rights or resource fields" }); return; }
  const row = await db.transaction(async (tx) => {
    const id = String(req.params.id);
    const [old] = await tx.select().from(resourcesTable).where(eq(resourcesTable.id, id)).for("update");
    if (!old) return null;
    const [updated] = await tx.update(resourcesTable).set({ ...values, editorId: getAuth(req).userId!, status: "draft",
      reviewedBy: null, reviewedAt: null, reviewerId: null, lastCheckedAt: null, linkState: "unchecked", removalReason: null, updatedAt: new Date() }).where(eq(resourcesTable.id, id)).returning();
    await tx.insert(resourceEventsTable).values({ id: randomUUID(), resourceId: id, actorId: getAuth(req).userId!, action: "edit", note: "Review invalidated by edit" });
    return updated;
  });
  if (!row) { res.status(404).json({ error: "Resource unavailable" }); return; }
  res.json(output(row));
});

export async function checkResourceRow(row: ResourceRow) {
  let state: ResourceRow["linkState"] = "unavailable";
  try {
    const result = await external(row.url, false);
    state = result.redirected ? "redirected" : result.status >= 200 && result.status < 300 ? "reachable" : "unavailable";
  } catch { /* An explicit unavailable result, not a synthetic success. */ }
  return await db.transaction(async (tx) => {
    const [current] = await tx.select().from(resourcesTable).where(eq(resourcesTable.id, row.id)).for("update");
    // Never attach a check of an old URL/version to an edited record.
    if (!current) return null;
    if (current.updatedAt.getTime() !== row.updatedAt.getTime() || current.url !== row.url) return current;
    const [updated] = await tx.update(resourcesTable).set({ linkState: state, lastCheckedAt: new Date() }).where(eq(resourcesTable.id, row.id)).returning();
    return updated;
  });
}
router.post("/staff/resources/:id/check", ...requireStaffEducationRead, networkQuota, async (req, res): Promise<void> => {
  const [row] = await db.select().from(resourcesTable).where(eq(resourcesTable.id, String(req.params.id))).limit(1);
  if (!row) { res.status(404).json({ error: "Resource unavailable" }); return; }
  const updated = await checkResourceRow(row);
  if (!updated) { res.status(404).json({ error: "Resource unavailable" }); return; }
  res.json(output(updated));
});
router.post("/staff/resources/:id/review", ...requireStaffCapability("education.review"), async (req, res): Promise<void> => {
  const parsed = ReviewResourceBody.strict().safeParse(req.body);
  if (!parsed.success || !text(parsed.data.reviewerName, 100) || !text(parsed.data.note, 1000)) { res.status(400).json({ error: "Reviewer attribution, note and rights confirmation required" }); return; }
  const result = await db.transaction(async (tx) => {
    const id = String(req.params.id);
    const [row] = await tx.select().from(resourcesTable).where(eq(resourcesTable.id, id)).for("update");
    if (!row) return { code: 404, error: "Resource unavailable" };
    if (row.editorId === getAuth(req).userId!) return { code: 403, error: "A separate reviewer is required" };
    if (row.status !== "draft" || row.linkState !== "reachable" || !row.lastCheckedAt || Date.now() - row.lastCheckedAt.getTime() > 86400000) {
      return { code: 409, error: "Draft requires a reachable, nonredirecting safe link check within 24 hours" };
    }
    const [updated] = await tx.update(resourcesTable).set({ status: "reviewed", reviewerId: getAuth(req).userId!,
      reviewedBy: text(parsed.data.reviewerName, 100), reviewedAt: new Date(), updatedAt: new Date() }).where(eq(resourcesTable.id, id)).returning();
    await tx.insert(resourceEventsTable).values({ id: randomUUID(), resourceId: id, actorId: getAuth(req).userId!, action: "review", note: text(parsed.data.note, 1000) });
    return { code: 200, row: updated };
  });
  if (!result.row) { res.status(result.code).json({ error: result.error }); return; }
  res.json(output(result.row));
});
router.post("/staff/resources/:id/remove", ...requireStaffCapability("education.publish"), async (req, res): Promise<void> => {
  const parsed = RemoveResourceBody.strict().safeParse(req.body);
  if (!parsed.success || !text(parsed.data.reason, 1000)) { res.status(400).json({ error: "Removal reason required" }); return; }
  const row = await db.transaction(async (tx) => {
    const id = String(req.params.id);
    const [old] = await tx.select().from(resourcesTable).where(eq(resourcesTable.id, id)).for("update");
    if (!old) return null;
    const reason = text(parsed.data.reason, 1000);
    const [updated] = await tx.update(resourcesTable).set({ status: "removed", removalReason: reason, updatedAt: new Date() }).where(eq(resourcesTable.id, id)).returning();
    await tx.insert(resourceEventsTable).values({ id: randomUUID(), resourceId: id, actorId: getAuth(req).userId!, action: "remove", note: reason });
    return updated;
  });
  if (!row) { res.status(404).json({ error: "Resource unavailable" }); return; }
  res.json(output(row));
});
router.get("/staff/resource-reports", ...requireStaffEducationRead, async (_req, res): Promise<void> => {
  const rows = await db.select().from(resourceReportsTable).orderBy(desc(resourceReportsTable.createdAt)).limit(200);
  res.set("Cache-Control", "no-store").json({ items: rows.map(reportOutput) });
});
router.post("/staff/resource-reports/:id/resolve", ...requireStaffCapability("education.publish"), async (req, res): Promise<void> => {
  const parsed = ResolveResourceReportBody.strict().safeParse(req.body);
  if (!parsed.success || !text(parsed.data.reason, 1000)) { res.status(400).json({ error: "Decision reason required" }); return; }
  const [row] = await db.update(resourceReportsTable).set({ status: "resolved", resolution: text(parsed.data.reason, 1000), resolvedBy: getAuth(req).userId! })
    .where(and(eq(resourceReportsTable.id, String(req.params.id)), eq(resourceReportsTable.status, "open"))).returning();
  if (!row) { res.status(409).json({ error: "Report unavailable or already resolved" }); return; }
  res.json(reportOutput(row));
});
export default router;
