import { Router, type IRouter, type Request } from "express";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  db, membersTable, educationCategoriesTable, educationLessonsTable,
  educationRevisionsTable, educationSourcesTable, educationCorrectionsTable,
  educationSavesTable, educationProgressTable,
  profilesTable, safetyRelationshipsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/account-auth";
import { requireStaffCapability, requireStaffEducationRead } from "../middlewares/staff-auth";
import "../lib/education-deletion-hook";

const router: IRouter = Router();
const completionDisclaimer = "Educational activity only; not a clinical qualification.";
const revisionBodyLimit = 100_000;
const asString = (value: string | string[] | undefined): string => Array.isArray(value) ? value[0] : (value ?? "");
const now = () => new Date();
const taxonomy = [
  ["education-understanding", "understanding", "Understanding"],
  ["education-communication", "communication", "Communication"],
  ["education-support", "support", "Support"],
  ["education-safety", "safety", "Safety"],
  ["education-resources", "resources", "Resources"],
] as const;

let phase11PublishBarrier: { reached: Promise<void>; release: () => void; signal: () => void; released: Promise<void> } | null = null;
/** Test-only sequencing aid; never armed or awaited outside NODE_ENV=test. */
export function armPhase11PublishBarrier() {
  if (process.env.NODE_ENV !== "test") throw new Error("Phase 11 barrier is test-only");
  let reachedResolve!: () => void;
  let releaseResolve!: () => void;
  const barrier = {
    reached: new Promise<void>((resolve) => { reachedResolve = resolve; }),
    release: () => releaseResolve(),
    signal: () => reachedResolve(),
    released: new Promise<void>((resolve) => { releaseResolve = resolve; }),
  };
  phase11PublishBarrier = barrier;
  return { reached: barrier.reached, release: barrier.release };
}

async function waitForPhase11PublishBarrier(req: Request) {
  if (process.env.NODE_ENV === "test" && req.query.phase11Barrier === "publish" && phase11PublishBarrier) {
    const barrier = phase11PublishBarrier;
    barrier.signal();
    await barrier.released;
    phase11PublishBarrier = null;
  }
}

async function ensureTaxonomy() {
  await db.insert(educationCategoriesTable).values(taxonomy.map(([id, slug, name], sortOrder) => ({
    id, slug, name, sortOrder, description: null, active: true,
  }))).onConflictDoNothing({ target: educationCategoriesTable.slug });
}

function actor(req: Request): string {
  return getAuth(req).userId!;
}

async function memberFor(req: any) {
  const userId = getAuth(req).userId!;
  return (await db.select().from(membersTable).where(and(eq(membersTable.clerkUserId, userId), eq(membersTable.active, true))).limit(1))[0];
}

async function revisionFor(lessonId: string, revisionId?: string) {
  const where = revisionId
    ? and(eq(educationRevisionsTable.lessonId, lessonId), eq(educationRevisionsTable.id, revisionId))
    : eq(educationRevisionsTable.lessonId, lessonId);
  return (await db.select().from(educationRevisionsTable).where(where).orderBy(desc(educationRevisionsTable.version)).limit(1))[0];
}

async function sourcesFor(revisionId: string) {
  // Education revisions, sources, and corrections are append-only audit history.
  // This router intentionally exposes no update/delete handlers for those rows;
  // only review metadata transitions are permitted, under a row lock.
  return db.select().from(educationSourcesTable).where(eq(educationSourcesTable.revisionId, revisionId)).orderBy(asc(educationSourcesTable.id));
}

async function staffLessonPayload(lesson: any) {
  const currentRevision = lesson.currentRevisionId
    ? (await db.select().from(educationRevisionsTable).where(eq(educationRevisionsTable.id, lesson.currentRevisionId)).limit(1))[0]
    : null;
  return { ...lesson, currentRevision: currentRevision ? { ...currentRevision, sources: await sourcesFor(currentRevision.id) } : null };
}

function validatePlainTextBody(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > revisionBodyLimit) {
    throw new Error(`body must be plain text from 1 to ${revisionBodyLimit} characters`);
  }
  if (/<\/?[A-Za-z][^>]*>/.test(value)) throw new Error("body must be plain text, not HTML");
  return value;
}

function publicRevision(revision: any, sources: any[], status: string) {
  return {
    id: revision.id, version: revision.version, title: revision.title, summary: revision.summary,
    body: revision.body, region: revision.region, educationalWording: revision.educationalWording,
    accessibleMedia: revision.accessibleMedia ?? null, status, sources: sources.map((source) => ({
      id: source.id, revisionId: source.revisionId, kind: source.kind, citation: source.citation, url: source.url, provenance: source.provenance,
      sourceDate: source.sourceDate, region: source.region, rightsStatus: source.rightsStatus, rightsPermissions: source.rightsPermissions,
    })),
  };
}

export async function publicLesson(lesson: any) {
  if (!lesson.publishedRevisionId || lesson.status === "archived" || lesson.withdrawnAt) return null;
  const revision = (await db.select().from(educationRevisionsTable).where(and(
    eq(educationRevisionsTable.id, lesson.publishedRevisionId),
    eq(educationRevisionsTable.lessonId, lesson.id),
  )).limit(1))[0];
  if (!revision) return null;
  const due = lesson.status === "review_due" || (lesson.reviewDueAt && new Date(lesson.reviewDueAt).getTime() <= Date.now());
  return {
    id: lesson.id, slug: lesson.slug, title: revision.title, summary: revision.summary,
    categoryId: lesson.categoryId, status: due ? "review_due" : "published", reviewDue: Boolean(due),
    publishedAt: lesson.publishedAt, reviewDueAt: lesson.reviewDueAt,
    revision: publicRevision(revision, await sourcesFor(revision.id), due ? "review_due" : "published"),
  };
}

// Public education is deliberately unranked: category, search, and keyset-like
// stable title/id ordering never use saves, progress, or engagement.
router.get("/education/categories", async (_req, res): Promise<void> => {
  await ensureTaxonomy();
  const categories = await db.select().from(educationCategoriesTable)
    .where(eq(educationCategoriesTable.active, true)).orderBy(asc(educationCategoriesTable.sortOrder), asc(educationCategoriesTable.id));
  res.json({ items: categories.map(({ id, slug, name, description, sortOrder }) => ({ id, slug, name, description, sortOrder })) });
});

router.get(["/education", "/education/search"], async (req, res): Promise<void> => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const parsedLimit = Number(req.query.limit ?? 20);
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(50, parsedLimit)) : 20;
  const categoryRow = category ? (await db.select().from(educationCategoriesTable).where(or(eq(educationCategoriesTable.id, category), eq(educationCategoriesTable.slug, category))).limit(1))[0] : undefined;
  const rows = await db.select().from(educationLessonsTable).where(and(
    or(eq(educationLessonsTable.status, "published"), eq(educationLessonsTable.status, "review_due")),
    ...(category ? [eq(educationLessonsTable.categoryId, categoryRow?.id ?? "__no_such_category__")] : []),
  )).orderBy(asc(educationLessonsTable.title), asc(educationLessonsTable.id));
  let items = (await Promise.all(rows.map(publicLesson))).filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => !query || `${item.title} ${item.summary}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  if (cursor) {
    const cursorIndex = items.findIndex((item) => item.id === cursor);
    if (cursorIndex >= 0) items = items.slice(cursorIndex + 1);
  }
  const hasMore = items.length > limit;
  if (hasMore) items.length = limit;
  const next = hasMore ? items[items.length - 1]?.id ?? null : null;
  res.json({ items, nextCursor: next ?? null });
});

// Private learning state is always account-bound and is not visible to staff
// or other members through public education responses.
router.get("/education/me", requireAuth, async (req, res): Promise<void> => {
  const member = await memberFor(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const [saves, progress] = await Promise.all([
    db.select().from(educationSavesTable).where(eq(educationSavesTable.memberId, member.id)).orderBy(desc(educationSavesTable.createdAt)),
    db.select().from(educationProgressTable).where(eq(educationProgressTable.memberId, member.id)).orderBy(desc(educationProgressTable.updatedAt)),
  ]);
  const lessonIds = [...new Set([...saves.map((row) => row.lessonId), ...progress.map((row) => row.lessonId)])];
  const lessons = lessonIds.length ? await db.select().from(educationLessonsTable).where((inArray(educationLessonsTable.id, lessonIds))) : [];
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const enrich = async (row: any) => {
    const lesson = lessonById.get(row.lessonId);
    const visible = lesson && await publicLesson(lesson);
    return visible ? { ...row, lesson: { id: lesson.id, slug: lesson.slug, title: visible.title, summary: visible.summary, categoryId: lesson.categoryId, status: visible.status } } : null;
  };
  const enrichedSaves = (await Promise.all(saves.map(enrich))).filter(Boolean);
  const enrichedProgress = (await Promise.all(progress.map(enrich))).filter(Boolean).map((row: any) => ({ ...row, completionDisclaimer }));
  const nextLesson = enrichedProgress.find((row: any) => row.completedAt === null && row.percent !== 100) ?? null;
  res.json({ saves: enrichedSaves, progress: enrichedProgress, continue: nextLesson ? { lessonId: nextLesson.lessonId, revisionId: nextLesson.revisionId, position: nextLesson.position, percent: nextLesson.percent } : null });
});

router.get("/education/completions", requireAuth, async (req, res): Promise<void> => {
  const member = await memberFor(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const rows = await db.select().from(educationProgressTable).where(and(eq(educationProgressTable.memberId, member.id), eq(educationProgressTable.completionOptIn, true)));
  const items = [];
  for (const row of rows) {
    const lesson = (await db.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, row.lessonId)).limit(1))[0];
    const visible = lesson && await publicLesson(lesson);
    if (visible && row.completedAt) items.push({ lessonId: row.lessonId, slug: lesson.slug, title: visible.title, completedAt: row.completedAt, completionDisclaimer });
  }
  res.json({ items, completionDisclaimer });
});

router.get("/education/:lessonId/completions", requireAuth, async (req, res): Promise<void> => {
  const viewer = await memberFor(req);
  if (!viewer) { res.status(404).json({ error: "Onboarding required" }); return; }
  const lessonId = asString(req.params.lessonId);
  const lesson = (await db.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, lessonId)).limit(1))[0];
  if (!lesson || !await publicLesson(lesson)) { res.status(404).json({ error: "Education lesson not found" }); return; }
  const blocked = await db.select().from(safetyRelationshipsTable).where(and(
    or(
      and(eq(safetyRelationshipsTable.actorMemberId, viewer.id), eq(safetyRelationshipsTable.targetMemberId, viewer.id)),
      eq(safetyRelationshipsTable.actorMemberId, viewer.id),
      eq(safetyRelationshipsTable.targetMemberId, viewer.id),
    ),
    eq(safetyRelationshipsTable.kind, "block"),
  ));
  const blockedIds = new Set(blocked.flatMap((row) => [row.actorMemberId, row.targetMemberId]));
  const rows = await db.select().from(educationProgressTable).where(and(eq(educationProgressTable.lessonId, lessonId), eq(educationProgressTable.completionOptIn, true)));
  const items = [];
  for (const row of rows) {
    if (!row.completedAt || blockedIds.has(row.memberId)) continue;
    const profile = (await db.select().from(profilesTable).where(and(eq(profilesTable.memberId, row.memberId), eq(profilesTable.discoverable, true))).limit(1))[0];
    const visibility = profile?.visibility?.preferredName;
    if (profile && (visibility === "members" || row.memberId === viewer.id)) items.push({ memberId: row.memberId, preferredName: row.memberId === viewer.id || visibility === "members" ? profile.preferredName : null, completedAt: row.completedAt });
  }
  res.json({ items, completionDisclaimer });
});

router.put("/education/me/saves/:lessonId", requireAuth, async (req, res): Promise<void> => {
  const member = await memberFor(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const lessonId = asString(req.params.lessonId);
  const lesson = (await db.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, lessonId)).limit(1))[0];
  if (!lesson || !await publicLesson(lesson)) { res.status(404).json({ error: "Education lesson not found" }); return; }
  const [save] = await db.insert(educationSavesTable).values({ id: randomUUID(), memberId: member.id, lessonId })
    .onConflictDoNothing({ target: [educationSavesTable.memberId, educationSavesTable.lessonId] }).returning();
  const saved = save ?? (await db.select().from(educationSavesTable).where(and(eq(educationSavesTable.memberId, member.id), eq(educationSavesTable.lessonId, lessonId))).limit(1))[0];
  res.status(save ? 201 : 200).json({ ...saved, lesson: { id: lesson.id, slug: lesson.slug, title: (await publicLesson(lesson))!.title, summary: (await publicLesson(lesson))!.summary, categoryId: lesson.categoryId, status: (await publicLesson(lesson))!.status } });
});

router.delete("/education/me/saves/:lessonId", requireAuth, async (req, res): Promise<void> => {
  const member = await memberFor(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  await db.delete(educationSavesTable).where(and(eq(educationSavesTable.memberId, member.id), eq(educationSavesTable.lessonId, asString(req.params.lessonId))));
  res.sendStatus(204);
});

router.put("/education/me/progress/:lessonId", requireAuth, async (req, res): Promise<void> => {
  const member = await memberFor(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const lessonId = asString(req.params.lessonId);
  const lesson = (await db.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, lessonId)).limit(1))[0];
  const visible = lesson && await publicLesson(lesson);
  if (!visible) { res.status(404).json({ error: "Education lesson not found" }); return; }
  const percent = req.body?.percent === null || req.body?.percent === undefined ? null : Number(req.body.percent);
  if (percent !== null && (!Number.isInteger(percent) || percent < 0 || percent > 100)) { res.status(400).json({ error: "percent must be null or an integer from 0 to 100" }); return; }
  const completed = Boolean(req.body?.completed) || percent === 100;
  const optIn = req.body?.completionOptIn === true;
  const [progress] = await db.insert(educationProgressTable).values({
    id: randomUUID(), memberId: member.id, lessonId, revisionId: visible.revision.id,
    percent, position: req.body?.position == null ? null : String(req.body.position),
    completedAt: completed ? now() : null, completionOptIn: optIn, updatedAt: now(),
  }).onConflictDoUpdate({ target: [educationProgressTable.memberId, educationProgressTable.lessonId], set: {
    revisionId: visible.revision.id, percent, position: req.body?.position == null ? null : String(req.body.position),
    completedAt: completed ? now() : null, completionOptIn: optIn, updatedAt: now(),
  }}).returning();
  res.json({ ...progress, lesson: { id: lesson.id, slug: lesson.slug, title: visible.title, summary: visible.summary, categoryId: lesson.categoryId, status: visible.status }, completionDisclaimer });
});

router.post("/education/me/progress/:lessonId/reset", requireAuth, async (req, res): Promise<void> => {
  const member = await memberFor(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  await db.delete(educationProgressTable).where(and(eq(educationProgressTable.memberId, member.id), eq(educationProgressTable.lessonId, asString(req.params.lessonId))));
  res.sendStatus(204);
});

// Completion visibility is an explicit, retractable member choice rather than
// a side effect of reaching 100 percent.
router.put("/education/me/completion/:lessonId", requireAuth, async (req, res): Promise<void> => {
  const member = await memberFor(req);
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  if (typeof req.body?.optIn !== "boolean") { res.status(400).json({ error: "optIn must be a boolean" }); return; }
  const lessonId = asString(req.params.lessonId);
  const existing = (await db.select().from(educationProgressTable).where(and(eq(educationProgressTable.memberId, member.id), eq(educationProgressTable.lessonId, lessonId))).limit(1))[0];
  if (!existing) { res.status(404).json({ error: "Progress not found" }); return; }
  const [progress] = await db.update(educationProgressTable).set({ completionOptIn: req.body.optIn, updatedAt: now() }).where(eq(educationProgressTable.id, existing.id)).returning();
  const lesson = (await db.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, lessonId)).limit(1))[0];
  const visible = lesson && await publicLesson(lesson);
  res.json({ ...progress, lesson: visible ? { id: lesson.id, slug: lesson.slug, title: visible.title, summary: visible.summary, categoryId: lesson.categoryId, status: visible.status } : null, completionDisclaimer });
});

router.get("/education/:slug", async (req, res): Promise<void> => {
  const lesson = (await db.select().from(educationLessonsTable).where(eq(educationLessonsTable.slug, asString(req.params.slug))).limit(1))[0];
  const result = lesson && await publicLesson(lesson);
  if (!result) { res.status(404).json({ error: "Education lesson not found" }); return; }
  res.json(result);
});

const staffAuthor = requireStaffCapability("education.author");
const staffReviewer = requireStaffCapability("education.review");
const staffPublisher = requireStaffCapability("education.publish");

function parseSources(input: unknown, revisionId: string) {
  if (!Array.isArray(input)) throw new Error("At least one traceable source is required");
  return input.map((source: any) => {
    if (!source || typeof source !== "object" || !["historical", "historical_population_research", "current_evidence", "guidance", "service", "licensed_link"].includes(source.kind)) throw new Error("Invalid source kind");
    if (!source.citation || !source.provenance || !source.url || !source.region || !source.rightsPermissions || !source.rightsStatus) throw new Error("Source citation, provenance, URL, region, rights status, and rights/permissions are required");
    if (!["original", "permitted", "link_only"].includes(source.rightsStatus)) throw new Error("Invalid rights status");
    if (source.kind === "licensed_link" && (!source.url || typeof source.url !== "string")) throw new Error("Licensed content must be linked, not copied");
    return {
      id: source.id ? String(source.id) : randomUUID(), revisionId, kind: source.kind, citation: String(source.citation), url: source.url ? String(source.url) : null,
      provenance: String(source.provenance), sourceDate: source.sourceDate ? new Date(source.sourceDate) : null,
      region: String(source.region), rightsStatus: source.rightsStatus, rightsPermissions: String(source.rightsPermissions),
      verifiedAt: source.verifiedAt ? new Date(source.verifiedAt) : null,
      evidenceCheckedAt: source.evidenceCheckedAt ? new Date(source.evidenceCheckedAt) : null,
      currentEvidenceSourceId: source.currentEvidenceSourceId ? String(source.currentEvidenceSourceId) : null,
    };
  });
}

async function createRevision(lessonId: string, body: any, userId: string) {
  const bodyText = validatePlainTextBody(body.body);
  if (body.containsCopiedRestrictedContent === true) throw new Error("Copied restricted content must not be submitted");
  const sourceRows = parseSources(body.sources, "pending");
  return db.transaction(async (tx) => {
    const lesson = (await tx.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, lessonId)).for("update").limit(1))[0];
    if (!lesson) throw new Error("Education lesson not found");
    const latest = (await tx.select().from(educationRevisionsTable).where(eq(educationRevisionsTable.lessonId, lessonId)).orderBy(desc(educationRevisionsTable.version)).limit(1))[0];
    const version = (latest?.version ?? 0) + 1;
    const id = randomUUID();
    const rows = sourceRows.map((row) => ({ ...row, id: row.id === "pending" ? randomUUID() : row.id, revisionId: id }));
    const [revision] = await tx.insert(educationRevisionsTable).values({
      id, lessonId, version, title: String(body.title), summary: String(body.summary),
      body: bodyText, region: String(body.region), educationalWording: String(body.educationalWording),
      avoidsBlameAndGuarantees: body.avoidsBlameAndGuarantees === true,
      avoidsBlameAttestation: body.avoidsBlameAttestation === true,
      avoidsIndividualGuaranteesAttestation: body.avoidsIndividualGuaranteesAttestation === true,
      restrictedContentLinkedOnly: body.restrictedContentLinkedOnly === true,
      contentRightsConfirmed: body.contentRightsConfirmed === true,
      containsCopiedRestrictedContent: body.containsCopiedRestrictedContent === true,
      status: "draft", authorClerkUserId: userId, accessibleMedia: body.accessibleMedia ?? null,
    }).returning();
    await tx.insert(educationSourcesTable).values(rows);
    await tx.update(educationLessonsTable).set({ currentRevisionId: id, status: "draft", updatedAt: now() }).where(eq(educationLessonsTable.id, lessonId));
    return revision;
  });
}

router.get("/staff/education", ...requireStaffEducationRead, async (_req, res): Promise<void> => {
  const rows = await db.select().from(educationLessonsTable).orderBy(desc(educationLessonsTable.updatedAt), asc(educationLessonsTable.id));
  const items = await Promise.all(rows.map(staffLessonPayload));
  res.json({ items });
});

router.post("/staff/education", ...staffAuthor, async (req, res): Promise<void> => {
  const userId = actor(req);
  let createdLessonId: string | undefined;
  try {
    await ensureTaxonomy();
    if (!req.body?.categoryId || !req.body?.slug || !req.body?.title) throw new Error("categoryId, slug, and title are required");
    const category = (await db.select().from(educationCategoriesTable).where(and(eq(educationCategoriesTable.id, String(req.body.categoryId)), eq(educationCategoriesTable.active, true))).limit(1))[0];
    if (!category) { res.status(400).json({ error: "Active education category is required" }); return; }
    const id = randomUUID();
    createdLessonId = id;
    const [lesson] = await db.insert(educationLessonsTable).values({ id, categoryId: category.id, slug: String(req.body.slug), title: String(req.body.title), authorClerkUserId: userId }).returning();
    if (req.body.body !== undefined) await createRevision(id, req.body, userId);
    const created = (await db.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, lesson.id)).limit(1))[0];
    res.status(201).json(await staffLessonPayload(created));
  } catch (error) {
    if (createdLessonId) await db.delete(educationLessonsTable).where(eq(educationLessonsTable.id, createdLessonId));
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid education lesson" });
  }
});

router.get("/staff/education/:id", ...requireStaffEducationRead, async (req, res): Promise<void> => {
  const lesson = (await db.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, asString(req.params.id))).limit(1))[0];
  if (!lesson) { res.status(404).json({ error: "Education lesson not found" }); return; }
  const revisions = await db.select().from(educationRevisionsTable).where(eq(educationRevisionsTable.lessonId, lesson.id)).orderBy(desc(educationRevisionsTable.version));
  const fullRevisions = await Promise.all(revisions.map(async (revision) => ({ ...revision, sources: await sourcesFor(revision.id) })));
  const currentRevision = fullRevisions.find((revision) => revision.id === lesson.currentRevisionId) ?? null;
  res.json({ lesson: { ...lesson, currentRevision }, revisions: fullRevisions, corrections: await db.select().from(educationCorrectionsTable).where(eq(educationCorrectionsTable.lessonId, lesson.id)).orderBy(desc(educationCorrectionsTable.createdAt)) });
});

router.post("/staff/education/:id/revisions", ...staffAuthor, async (req, res): Promise<void> => {
  const lesson = (await db.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, asString(req.params.id))).limit(1))[0];
  if (!lesson) { res.status(404).json({ error: "Education lesson not found" }); return; }
  try {
    const revision = await createRevision(lesson.id, req.body, actor(req));
    res.status(201).json({ ...revision, sources: await sourcesFor(revision.id) });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Invalid revision" }); }
});

router.post("/staff/education/:id/revisions/:revisionId/submit-review", ...staffAuthor, async (req, res): Promise<void> => {
  const lessonId = asString(req.params.id);
  const revisionId = asString(req.params.revisionId);
  try {
    const revision = await db.transaction(async (tx) => {
      const lesson = (await tx.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, lessonId)).for("update").limit(1))[0];
      const revision = lesson && (await tx.select().from(educationRevisionsTable).where(and(eq(educationRevisionsTable.id, revisionId), eq(educationRevisionsTable.lessonId, lessonId))).for("update").limit(1))[0];
      if (!lesson || !revision || revision.status !== "draft" || lesson.currentRevisionId !== revision.id) throw new Error("NOT_FOUND");
      await tx.update(educationRevisionsTable).set({ status: "review" }).where(and(eq(educationRevisionsTable.id, revision.id), eq(educationRevisionsTable.status, "draft")));
      await tx.update(educationLessonsTable).set({ status: "review", updatedAt: now() }).where(eq(educationLessonsTable.id, lesson.id));
      return { ...revision, status: "review" as const };
    });
    res.json({ ...revision, sources: await sourcesFor(revision.id) });
  } catch { res.status(404).json({ error: "Draft revision not found" }); }
});

router.post("/staff/education/:id/revisions/:revisionId/approve", ...staffReviewer, async (req, res): Promise<void> => {
  const reviewer = actor(req);
  try {
    const revision = await db.transaction(async (tx) => {
      const lessonId = asString(req.params.id);
      const lesson = (await tx.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, lessonId)).for("update").limit(1))[0];
      const revision = lesson && (await tx.select().from(educationRevisionsTable).where(and(eq(educationRevisionsTable.id, asString(req.params.revisionId)), eq(educationRevisionsTable.lessonId, lessonId))).for("update").limit(1))[0];
      if (!lesson || !revision || revision.status !== "review" || lesson.currentRevisionId !== revision.id) throw new Error("NOT_FOUND");
      if (reviewer === revision.authorClerkUserId) throw new Error("SELF");
      await tx.update(educationRevisionsTable).set({ status: "published", reviewerClerkUserId: reviewer, reviewedAt: now(), reviewNote: req.body?.note ? String(req.body.note) : null }).where(and(eq(educationRevisionsTable.id, revision.id), eq(educationRevisionsTable.status, "review")));
      return revision;
    });
    res.json({ id: revision.id, status: "approved", reviewerClerkUserId: reviewer });
  } catch (error) {
    if (error instanceof Error && error.message === "SELF") { res.status(403).json({ error: "Authors cannot review their own revision" }); return; }
    res.status(404).json({ error: "Revision awaiting review not found" });
  }
});

router.post("/staff/education/:id/revisions/:revisionId/reject", ...staffReviewer, async (req, res): Promise<void> => {
  const reviewer = actor(req);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!reason) { res.status(400).json({ error: "Rejection reason is required" }); return; }
  try {
    const revision = await db.transaction(async (tx) => {
      const lessonId = asString(req.params.id);
      const lesson = (await tx.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, lessonId)).for("update").limit(1))[0];
      const revision = lesson && (await tx.select().from(educationRevisionsTable).where(and(eq(educationRevisionsTable.id, asString(req.params.revisionId)), eq(educationRevisionsTable.lessonId, lessonId))).for("update").limit(1))[0];
      if (!lesson || !revision || revision.status !== "review" || lesson.currentRevisionId !== revision.id) throw new Error("NOT_FOUND");
      if (reviewer === revision.authorClerkUserId) throw new Error("SELF");
      await tx.update(educationRevisionsTable).set({
        status: "rejected", reviewerClerkUserId: reviewer, reviewedAt: now(), reviewNote: reason,
      }).where(and(eq(educationRevisionsTable.id, revision.id), eq(educationRevisionsTable.status, "review")));
      await tx.update(educationLessonsTable).set({ status: "draft", updatedAt: now() }).where(and(eq(educationLessonsTable.id, lesson.id), eq(educationLessonsTable.currentRevisionId, revision.id)));
      return { ...revision, status: "rejected" as const, reviewerClerkUserId: reviewer, reviewNote: reason };
    });
    res.json({ ...revision, sources: await sourcesFor(revision.id) });
  } catch (error) {
    if (error instanceof Error && error.message === "SELF") { res.status(403).json({ error: "Authors cannot review their own revision" }); return; }
    res.status(404).json({ error: "Revision awaiting rejection not found" });
  }
});

router.post("/staff/education/:id/publish", ...staffPublisher, async (req, res): Promise<void> => {
  const lessonId = asString(req.params.id);
  try {
    const published = await db.transaction(async (tx) => {
      const lesson = (await tx.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, lessonId)).for("update").limit(1))[0];
      if (!lesson) throw new Error("NOT_FOUND");
      const clockResult = await tx.execute(sql`select now() as now`);
      const dbClock = new Date(String((clockResult.rows[0] as { now: string }).now));
      const revision = (await tx.select().from(educationRevisionsTable).where(and(eq(educationRevisionsTable.lessonId, lesson.id), eq(educationRevisionsTable.id, lesson.currentRevisionId ?? ""))).for("update").limit(1))[0];
      const sources = revision ? await tx.select().from(educationSourcesTable).where(eq(educationSourcesTable.revisionId, revision.id)) : [];
      const verificationCutoff = dbClock.getTime() - 365 * 24 * 60 * 60 * 1000;
      const publicationCutoff = new Date(dbClock);
      publicationCutoff.setUTCFullYear(publicationCutoff.getUTCFullYear() - 5);
      const currentEvidenceValid = (s: any) => Boolean(s.sourceDate && s.verifiedAt && s.evidenceCheckedAt &&
        new Date(s.sourceDate).getTime() >= publicationCutoff.getTime() && new Date(s.sourceDate).getTime() <= dbClock.getTime() &&
        new Date(s.verifiedAt).getTime() >= verificationCutoff && new Date(s.verifiedAt).getTime() <= dbClock.getTime() &&
        new Date(s.evidenceCheckedAt).getTime() >= verificationCutoff && new Date(s.evidenceCheckedAt).getTime() <= dbClock.getTime());
      const hasHistoricalPopulationResearch = sources.some((s) => s.kind === "historical_population_research");
      const hasValidCurrentEvidence = sources.some((s) => s.kind === "current_evidence" && currentEvidenceValid(s));
      const valid = revision && revision.status === "published" && lesson.currentRevisionId === revision.id &&
        revision.reviewerClerkUserId && revision.reviewerClerkUserId !== revision.authorClerkUserId &&
        revision.educationalWording.trim() && revision.region.trim() && revision.avoidsBlameAttestation &&
        revision.avoidsIndividualGuaranteesAttestation && revision.avoidsBlameAndGuarantees &&
        revision.restrictedContentLinkedOnly && revision.contentRightsConfirmed && !revision.containsCopiedRestrictedContent && sources.length > 0 &&
        (!hasHistoricalPopulationResearch || hasValidCurrentEvidence) &&
        sources.every((s) => s.citation && s.provenance && s.region && s.rightsPermissions &&
          (s.kind !== "current_evidence" || currentEvidenceValid(s)) &&
          (s.kind !== "licensed_link" || (Boolean(s.url) && s.rightsStatus === "link_only")) &&
          (s.kind !== "historical_population_research" || hasValidCurrentEvidence));
      if (!valid) throw new Error("GATE");
      // Test-only barrier is reached while this transaction owns the lesson
      // lock, after validation and before publication; competing revisions
      // therefore deterministically wait for this publish to commit.
      await waitForPhase11PublishBarrier(req);
      const publishedAt = dbClock;
      const [updated] = await tx.update(educationLessonsTable).set({ status: "published", publishedRevisionId: revision.id, publishedAt, reviewDueAt: new Date(publishedAt.getTime() + 365 * 24 * 60 * 60 * 1000), updatedAt: publishedAt }).where(and(eq(educationLessonsTable.id, lesson.id), eq(educationLessonsTable.currentRevisionId, revision.id))).returning();
      if (!updated) throw new Error("GATE");
      return { lesson: updated, revision };
    });
    res.json(await publicLesson(published.lesson));
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") { res.status(404).json({ error: "Education lesson not found" }); return; }
    res.status(409).json({ error: "Publish gate not satisfied", requirements: ["approved latest revision", "qualified different reviewer", "sources, rights, educational wording, region, and evidence verification", "current evidence sourceDate must be no future and within 5 years; verification must be within 365 days (publication freshness policy, not medical truth)", "historical population research needs a valid same-revision current_evidence source", "blame and individual-prevention guarantees must be disclaimed", "restricted content must be linked only and not copied"] });
  }
});

router.post("/staff/education/:id/review-due", ...staffPublisher, async (req, res): Promise<void> => {
  const lesson = await db.transaction(async (tx) => {
    const current = (await tx.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, asString(req.params.id))).for("update").limit(1))[0];
    if (!current) return undefined;
    return (await tx.update(educationLessonsTable).set({ status: "review_due", updatedAt: now() }).where(eq(educationLessonsTable.id, current.id)).returning())[0];
  });
  if (!lesson) { res.status(404).json({ error: "Education lesson not found" }); return; }
  res.json(await staffLessonPayload(lesson));
});

router.post("/staff/education/:id/archive", ...staffPublisher, async (req, res): Promise<void> => {
  const lesson = await db.transaction(async (tx) => {
    const current = (await tx.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, asString(req.params.id))).for("update").limit(1))[0];
    if (!current) return undefined;
    return (await tx.update(educationLessonsTable).set({ status: "archived", archivedAt: now(), updatedAt: now() }).where(eq(educationLessonsTable.id, current.id)).returning())[0];
  });
  if (!lesson) { res.status(404).json({ error: "Education lesson not found" }); return; }
  res.json(await staffLessonPayload(lesson));
});

router.post("/staff/education/:id/withdraw", ...staffPublisher, async (req, res): Promise<void> => {
  const id = asString(req.params.id);
  const updated = await db.transaction(async (tx) => {
    const lesson = (await tx.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, id)).for("update").limit(1))[0];
    if (!lesson) return undefined;
    const at = now();
    await tx.insert(educationCorrectionsTable).values({ id: randomUUID(), lessonId: id, revisionId: lesson.publishedRevisionId, kind: "withdrawal", reason: String(req.body?.reason ?? "Withdrawn pending review"), actorClerkUserId: actor(req) });
    return (await tx.update(educationLessonsTable).set({ status: "archived", withdrawnAt: at, archivedAt: at, updatedAt: at }).where(eq(educationLessonsTable.id, id)).returning())[0];
  });
  if (!updated) { res.status(404).json({ error: "Education lesson not found" }); return; }
  res.json(await staffLessonPayload(updated));
});

router.post("/staff/education/:id/corrections", ...staffPublisher, async (req, res): Promise<void> => {
  const id = asString(req.params.id);
  if (!req.body?.reason) { res.status(400).json({ error: "Correction reason is required" }); return; }
  try {
    const correction = await db.transaction(async (tx) => {
      const lesson = (await tx.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, id)).for("update").limit(1))[0];
      if (!lesson) throw new Error("NOT_FOUND");
      const revisionId = Object.prototype.hasOwnProperty.call(req.body, "revisionId")
        ? (req.body.revisionId === null ? null : String(req.body.revisionId))
        : lesson.publishedRevisionId;
      const replacementRevisionId = req.body.replacementRevisionId ?? null;
      if (revisionId) {
        const revision = (await tx.select().from(educationRevisionsTable).where(and(eq(educationRevisionsTable.id, String(revisionId)), eq(educationRevisionsTable.lessonId, id))).limit(1))[0];
        if (!revision) throw new Error("REVISION");
      }
      if (replacementRevisionId) {
        const replacement = (await tx.select().from(educationRevisionsTable).where(and(eq(educationRevisionsTable.id, String(replacementRevisionId)), eq(educationRevisionsTable.lessonId, id))).limit(1))[0];
        if (!replacement) throw new Error("REVISION");
      }
      return (await tx.insert(educationCorrectionsTable).values({ id: randomUUID(), lessonId: id, revisionId, kind: "correction", reason: String(req.body.reason), replacementRevisionId, actorClerkUserId: actor(req) }).returning())[0];
    });
    res.status(201).json(correction);
  } catch (error) {
    res.status(error instanceof Error && error.message === "NOT_FOUND" ? 404 : 400).json({ error: "Correction and replacement revisions must belong to this lesson" });
  }
});

export default router;