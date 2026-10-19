import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import { db, membersTable, experiencePreferencesTable, experienceDraftsTable, translationsTable,
  translationReportsTable, postsTable, educationLessonsTable, educationRevisionsTable } from "@workspace/db";
import { requireAuth, memberRateLimit } from "../middlewares/account-auth";
import { requireStaffCapability, requireStaffEducationRead } from "../middlewares/staff-auth";
import { translationSource as source, currentTranslation as current } from "../lib/translation-authority";
import { locales, countries, defaultExperience, enabledLocale, validTimeZone, countryResources, resourceDisclaimer } from "../lib/experience-catalogue";
import { exportExperience } from "../lib/experience-data";
export { exportExperience };

const router = Router();
type Member = typeof membersTable.$inferSelect;
type Translation = typeof translationsTable.$inferSelect;
class Problem extends Error { constructor(public status: number, message: string) { super(message); } }
function fail(status: number, message: string): never { throw new Problem(status, message); }
const run = (fn: (req: Request, res: Response, member: Member) => Promise<void>) =>
  async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    try {
      const member = (await db.select().from(membersTable).where(and(eq(membersTable.clerkUserId, getAuth(req).userId!), eq(membersTable.active, true))).limit(1))[0];
      if (!member) fail(401, "Active account required");
      await fn(req, res, member);
    } catch (error) {
      if (error instanceof Problem) res.status(error.status).json({ error: error.message });
      else { console.error("Experience operation failed", error); res.status(500).json({ error: "Operation failed; your draft was not published" }); }
    }
  };
const preferencesInput = z.object({
  locale: z.string().refine(enabledLocale, "Interface review and moderation coverage are required").optional(),
  timeZone: z.string().refine(validTimeZone, "Use a valid IANA time zone").optional(),
  direction: z.enum(["auto", "ltr", "rtl"]).optional(), lowData: z.boolean().optional(),
  textFirst: z.boolean().optional(), offlineDrafts: z.boolean().optional(),
  country: z.enum(["AU", "GB", "US"]).optional(),
}).strict();
router.get("/experience/catalogue", (_req, res) => {
  res.set("Cache-Control", "no-store").json({ locales, countries });
});
router.get("/country-resources", (req, res) => {
  const country = typeof req.query.country === "string" ? req.query.country.toUpperCase() : "";
  if (!countries.some(c => c.code === country)) { res.status(400).json({ error: "Choose a curated country; no location is inferred" }); return; }
  res.set("Cache-Control", "no-store").json({ country, disclaimer: resourceDisclaimer, items: countryResources.filter(r => r.country === country) });
});
router.use(["/experience/preferences", "/experience/draft", "/translations"], requireAuth);
router.get("/experience/preferences", run(async (_req, res, member) => {
  const [row] = await db.select().from(experiencePreferencesTable).where(eq(experiencePreferencesTable.memberId, member.id));
  res.json(row ?? defaultExperience);
}));
router.patch("/experience/preferences", run(async (req, res, member) => {
  const parsed = preferencesInput.safeParse(req.body);
  if (!parsed.success) fail(400, "Unsupported/unreviewed locale, invalid time zone, country or preferences");
  const row = await db.transaction(async tx => {
    const [active] = await tx.select().from(membersTable).where(and(eq(membersTable.id, member.id), eq(membersTable.active, true))).for("update");
    if (!active) fail(401, "Account no longer active");
    const [saved] = await tx.insert(experiencePreferencesTable).values({ memberId: member.id, ...parsed.data })
      .onConflictDoUpdate({ target: experiencePreferencesTable.memberId, set: { ...parsed.data, updatedAt: new Date() } }).returning();
    return saved;
  });
  res.json(row);
}));
const draftInput = z.object({
  body: z.string().max(10000), audience: z.enum(["only_me", "friends", "my_circle", "this_group", "public"]).default("only_me"),
  circleId: z.string().max(200).nullable().optional(), groupId: z.string().max(200).nullable().optional(),
}).strict();
router.get("/experience/draft", run(async (_req, res, member) => {
  const [draft] = await db.select().from(experienceDraftsTable).where(eq(experienceDraftsTable.memberId, member.id));
  res.json({ draft: draft ?? null });
}));
router.put("/experience/draft", memberRateLimit(60, 60000, "experience-drafts"), run(async (req, res, member) => {
  const parsed = draftInput.safeParse(req.body); if (!parsed.success) fail(400, "Invalid draft (maximum 10,000 characters)");
  const values = { ...parsed.data, circleId: parsed.data.circleId ?? null, groupId: parsed.data.groupId ?? null, updatedAt: new Date() };
  const draft = await db.transaction(async tx => {
    const [active] = await tx.select().from(membersTable).where(and(eq(membersTable.id, member.id), eq(membersTable.active, true))).for("update");
    if (!active) fail(401, "Account no longer active");
    const [saved] = await tx.insert(experienceDraftsTable).values({ memberId: member.id, ...values })
      .onConflictDoUpdate({ target: experienceDraftsTable.memberId, set: values }).returning();
    return saved;
  });
  res.json({ draft });
}));
router.delete("/experience/draft", run(async (_req, res, member) => {
  await db.delete(experienceDraftsTable).where(eq(experienceDraftsTable.memberId, member.id)); res.status(204).end();
}));

const selector = z.object({ sourceType: z.enum(["post", "lesson"]), sourceId: z.string().min(1).max(200) });
const output = (row: Translation) => ({
  id: row.id, sourceType: row.sourceType, sourceId: row.sourceId, sourceHash: row.sourceHash,
  locale: row.locale, text: row.text, machineTranslated: row.machineTranslated, status: row.status,
  createdAt: row.createdAt, reviewedAt: row.reviewedAt, reviewedBy: row.reviewedBy,
});
router.get("/translations", run(async (req, res, member) => {
  const parsed = selector.strict().safeParse(req.query); if (!parsed.success) fail(400, "Choose an original post or lesson");
  if (!await source(parsed.data.sourceType, parsed.data.sourceId, member.id)) fail(404, "Original unavailable");
  const rows = await db.select().from(translationsTable).where(and(eq(translationsTable.sourceType, parsed.data.sourceType),
    eq(translationsTable.sourceId, parsed.data.sourceId), or(eq(translationsTable.status, "published"), eq(translationsTable.authorMemberId, member.id))))
    .orderBy(desc(translationsTable.createdAt)).limit(100);
  const items = [];
  for (const row of rows) if (row.status !== "removed" && await current(row, member.id)) items.push(output(row));
  // Providers deliberately unavailable: no external request, consent assumption or silent fallback.
  res.json({ items, providerEnabled: false });
}));
const translationInput = selector.extend({
  locale: z.string().refine(enabledLocale), text: z.string().trim().min(1).max(20000),
  machineTranslated: z.boolean(), correctionOf: z.string().max(200).optional(), rightsConfirmed: z.literal(true),
}).strict();
router.post("/translations", memberRateLimit(15, 60000, "translation-submit"), run(async (req, res, member) => {
  const parsed = translationInput.safeParse(req.body); if (!parsed.success) fail(400, "Translation, provenance, permitted locale and rights confirmation are required");
  const p = parsed.data, original = await source(p.sourceType, p.sourceId, member.id);
  if (!original) fail(404, "Original unavailable");
  let machineTranslated = p.machineTranslated;
  if (p.correctionOf) {
    const [old] = await db.select().from(translationsTable).where(eq(translationsTable.id, p.correctionOf));
    if (!old || old.sourceType !== p.sourceType || old.sourceId !== p.sourceId || old.locale !== p.locale ||
      (old.status !== "published" && old.authorMemberId !== member.id) || !(await current(old, member.id))) fail(404, "Correction source unavailable");
    machineTranslated ||= old.machineTranslated;
  }
  const [row] = await db.insert(translationsTable).values({ id: randomUUID(), sourceType: p.sourceType, sourceId: p.sourceId,
    sourceHash: original.hash, sourceRevisionId: original.revisionId, locale: p.locale, text: p.text,
    machineTranslated, authorMemberId: member.id, authorClerkId: getAuth(req).userId!, correctionOf: p.correctionOf ?? null }).returning();
  res.status(201).json(output(row));
}));
router.post("/translations/:id/reports", memberRateLimit(10, 60000, "translation-report"), run(async (req, res, member) => {
  const parsed = z.object({ reason: z.string().trim().min(1).max(1000) }).strict().safeParse(req.body);
  if (!parsed.success) fail(400, "A report reason is required");
  const [row] = await db.select().from(translationsTable).where(eq(translationsTable.id, String(req.params.id)));
  if (!row || row.status !== "published" || !await current(row, member.id)) fail(404, "Translation unavailable");
  const result = await db.insert(translationReportsTable).values({ id: randomUUID(), translationId: row.id, memberId: member.id, reason: parsed.data.reason })
    .onConflictDoNothing().returning();
  if (!result.length) fail(409, "Your translation report is already recorded");
  res.status(201).json({ recorded: true });
}));
router.get("/staff/translations", ...requireStaffEducationRead, run(async (_req, res, member) => {
  const rows = await db.select().from(translationsTable).where(or(eq(translationsTable.status, "pending"), eq(translationsTable.status, "reviewed"), eq(translationsTable.status, "published")))
    .orderBy(sql`exists (select 1 from ${translationReportsTable} where ${translationReportsTable.translationId} = ${translationsTable.id}) desc`, desc(translationsTable.createdAt)).limit(200);
  const items = [];
  for (const row of rows) if (await current(row, member.id)) {
    const reports = await db.select().from(translationReportsTable).where(eq(translationReportsTable.translationId, row.id)).limit(50);
    items.push({ ...output(row), authorMemberId: row.authorMemberId, reviewNote: row.reviewNote,
      reports: reports.map(r => ({ reason: r.reason, createdAt: r.createdAt })) });
  }
  res.json({ items });
}));
// A shared education gate deliberately also protects non-health translations.
// Safety staff without education capabilities cannot publish educational claims.
router.post("/staff/translations/:id/review", ...requireStaffEducationRead, run(async (req, res, member) => {
  const parsed = z.object({ action: z.enum(["review", "publish", "remove"]), note: z.string().trim().min(10).max(2000) }).strict().safeParse(req.body);
  if (!parsed.success) fail(400, "Choose review, publish or remove and provide a review note");
  const gate = requireStaffCapability(parsed.data.action === "publish" ? "education.publish" : "education.review");
  // Reuse the exact staff middleware, including fresh MFA and explicit capability narrowing.
  for (const middleware of gate) {
    let passed = false;
    await middleware(req, res, () => { passed = true; });
    if (!passed || res.headersSent) return;
  }
  const updated = await db.transaction(async tx => {
    const [row] = await tx.select().from(translationsTable).where(eq(translationsTable.id, String(req.params.id))).for("update");
    if (!row || row.status === "removed") fail(404, "Translation unavailable");
    if (row.sourceType === "post") await tx.select({ id: postsTable.id }).from(postsTable).where(eq(postsTable.id, row.sourceId)).for("update");
    else await tx.select({ id: educationLessonsTable.id }).from(educationLessonsTable).where(eq(educationLessonsTable.id, row.sourceId)).for("update");
    if (!await current(row, member.id)) fail(409, "Original changed, review expired, or source permission was revoked");
    const actor = getAuth(req).userId!, action = parsed.data.action;
    if (action === "review" && (row.status !== "pending" || actor === row.authorClerkId)) fail(409, "Independent review of a pending translation is required");
    if (action === "publish" && (row.status !== "reviewed" || actor === row.authorClerkId || actor === row.reviewedBy)) fail(409, "A separate publisher must follow independent review");
    if (action === "publish" && (!row.reviewedAt || Date.now() - row.reviewedAt.getTime() > 30 * 86400000)) fail(409, "Translation review has expired");
    if (action === "publish" && row.correctionOf) await tx.update(translationsTable).set({ status: "removed" }).where(eq(translationsTable.id, row.correctionOf));
    const [result] = await tx.update(translationsTable).set({
      status: action === "review" ? "reviewed" : action === "publish" ? "published" : "removed",
      ...(action === "review" ? { reviewedBy: actor, reviewedAt: new Date() } : {}),
      ...(action === "publish" ? { publishedBy: actor } : {}), reviewNote: parsed.data.note,
    }).where(eq(translationsTable.id, row.id)).returning();
    return result;
  });
  res.json(output(updated));
}));
export default router;
