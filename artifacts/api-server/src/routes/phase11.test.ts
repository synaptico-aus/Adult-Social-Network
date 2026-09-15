import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { createApp } from "../app.ts";
import { armPhase11PublishBarrier } from "./education.ts";
import {
  db, pool, membersTable, staffRoleAssignmentsTable,
  educationCategoriesTable, educationLessonsTable, educationRevisionsTable,
  educationSourcesTable, educationCorrectionsTable, educationSavesTable,
  educationProgressTable, profilesTable, safetyRelationshipsTable,
} from "@workspace/db";

const ids = {
  author: `phase11-author-${randomUUID()}`,
  reviewer: `phase11-reviewer-${randomUUID()}`,
  publisher: `phase11-publisher-${randomUUID()}`,
  alice: `phase11-alice-${randomUUID()}`,
  bob: `phase11-bob-${randomUUID()}`,
};
process.env.NODE_ENV = "test";
const staff = [ids.author, ids.reviewer, ids.publisher];
const allMembers = Object.values(ids);
const app = createApp({ authMiddleware: (req, _res, next) => {
  const userId = req.header("x-test-user") ?? null;
  const fresh = req.header("x-test-mfa") === "fresh";
  Object.assign(req, { auth: Object.assign(() => ({
    userId, sessionId: userId ? `phase11-session-${userId}` : null, tokenType: "session_token",
    sessionClaims: { fva: [fresh ? 1 : null, fresh ? 1 : 6] },
  }), { [Symbol.for("@clerk/express.auth")]: true }) });
  next();
} });
let server: ReturnType<typeof app.listen>;
let base = "";

async function call(path: string, user: string, options: { method?: string; body?: unknown; fresh?: boolean } = {}) {
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "x-test-user": user,
      ...(options.fresh ? { "x-test-mfa": "fresh" } : {}),
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json().catch(() => undefined) as any };
}

const categoryId = "education-understanding";
async function cleanAllEducationLessons() {
  const allLessons = await db.select({ id: educationLessonsTable.id, seedOrigin: educationLessonsTable.seedOrigin, authorClerkUserId: educationLessonsTable.authorClerkUserId }).from(educationLessonsTable);
  assert.equal(allLessons.filter((lesson) => lesson.seedOrigin === "seed").length, 0, "seeded lessons must remain absent in Phase 11");
  const lessons = allLessons.filter((lesson) => staff.includes(lesson.authorClerkUserId));
  const lessonIds = lessons.map((lesson) => lesson.id);
  if (!lessonIds.length) return;
  const revisions = await db.select({ id: educationRevisionsTable.id }).from(educationRevisionsTable).where(inArray(educationRevisionsTable.lessonId, lessonIds));
  const revisionIds = revisions.map((revision) => revision.id);
  await db.delete(educationCorrectionsTable).where(inArray(educationCorrectionsTable.lessonId, lessonIds));
  await db.delete(educationSavesTable).where(inArray(educationSavesTable.lessonId, lessonIds));
  await db.delete(educationProgressTable).where(inArray(educationProgressTable.lessonId, lessonIds));
  if (revisionIds.length) await db.delete(educationSourcesTable).where(inArray(educationSourcesTable.revisionId, revisionIds));
  await db.delete(educationRevisionsTable).where(inArray(educationRevisionsTable.lessonId, lessonIds));
  await db.delete(educationLessonsTable).where(inArray(educationLessonsTable.id, lessonIds));
}
function source(kind: string, extra: Record<string, unknown> = {}) {
  return {
    id: `source-${randomUUID()}`, kind, citation: "Neutral test citation",
    provenance: "Neutral test provenance", url: "https://example.invalid/neutral-source", region: "test-region",
    rightsStatus: "permitted", rightsPermissions: "Test permission record",
    sourceDate: "2025-01-01T00:00:00.000Z", verifiedAt: new Date().toISOString(),
    evidenceCheckedAt: new Date().toISOString(), ...extra,
  };
}
function revisionBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "Neutral test lesson", summary: "Neutral test summary",
    body: "Neutral educational test text; it makes no research or clinical claim.",
    region: "test-region", educationalWording: "For education only; not advice or a guarantee.",
    avoidsBlameAndGuarantees: true, restrictedContentLinkedOnly: true, contentRightsConfirmed: true, containsCopiedRestrictedContent: false,
    avoidsBlameAttestation: true, avoidsIndividualGuaranteesAttestation: true,
    sources: [source("current_evidence")], ...overrides,
  };
}
async function createLesson(user = ids.author, body: Record<string, unknown> = revisionBody()) {
  const result = await call("/api/staff/education", user, {
    method: "POST", fresh: true,
    body: { categoryId, slug: `neutral-${randomUUID()}`, title: "Neutral test lesson", ...body },
  });
  assert.equal(result.status, 201);
  return result.body;
}
async function publish(lessonId: string) {
  const detail = await call(`/api/staff/education/${lessonId}`, ids.author, { fresh: true });
  const revisionId = detail.body.revisions[0].id;
  assert.equal((await call(`/api/staff/education/${lessonId}/revisions/${revisionId}/submit-review`, ids.author, { method: "POST", fresh: true })).status, 200);
  assert.equal((await call(`/api/staff/education/${lessonId}/revisions/${revisionId}/approve`, ids.reviewer, { method: "POST", fresh: true })).status, 200);
  assert.equal((await call(`/api/staff/education/${lessonId}/publish`, ids.publisher, { method: "POST", fresh: true })).status, 200);
  return { revisionId, slug: detail.body.lesson.slug };
}

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await cleanAllEducationLessons();
  await db.insert(membersTable).values(allMembers.map((id) => ({ id, clerkUserId: id, emailVerified: true })));
  await db.insert(staffRoleAssignmentsTable).values([
    { id: randomUUID(), clerkUserId: ids.author, role: "education_editor", capabilities: ["education.author", "education.review"], active: true },
    { id: randomUUID(), clerkUserId: ids.reviewer, role: "education_editor", capabilities: ["education.review"], active: true },
    { id: randomUUID(), clerkUserId: ids.publisher, role: "education_editor", capabilities: ["education.publish"], active: true },
  ]);
});
beforeEach(async () => {
  const lessons = await db.select({ id: educationLessonsTable.id }).from(educationLessonsTable).where(inArray(educationLessonsTable.authorClerkUserId, staff));
  const lessonIds = lessons.map((lesson) => lesson.id);
  if (lessonIds.length) {
    const revisions = await db.select({ id: educationRevisionsTable.id }).from(educationRevisionsTable).where(inArray(educationRevisionsTable.lessonId, lessonIds));
    const revisionIds = revisions.map((revision) => revision.id);
    await db.delete(educationCorrectionsTable).where(inArray(educationCorrectionsTable.lessonId, lessonIds));
    await db.delete(educationSavesTable).where(inArray(educationSavesTable.lessonId, lessonIds));
    await db.delete(educationProgressTable).where(inArray(educationProgressTable.lessonId, lessonIds));
    if (revisionIds.length) await db.delete(educationSourcesTable).where(inArray(educationSourcesTable.revisionId, revisionIds));
    await db.delete(educationRevisionsTable).where(inArray(educationRevisionsTable.lessonId, lessonIds));
    await db.delete(educationLessonsTable).where(inArray(educationLessonsTable.id, lessonIds));
  }
});
after(async () => {
  await db.delete(staffRoleAssignmentsTable).where(inArray(staffRoleAssignmentsTable.clerkUserId, staff));
  await db.delete(membersTable).where(inArray(membersTable.id, allMembers));
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
});

test("taxonomy is seeded without lessons and drafts/review remain publicly invisible", async () => {
  const categories = await call("/api/education/categories", ids.alice);
  assert.equal(categories.status, 200);
  assert.deepEqual(categories.body.items.map((item: any) => item.slug), ["understanding", "communication", "support", "safety", "resources"]);
  assert.equal((await db.select().from(educationLessonsTable).where(inArray(educationLessonsTable.authorClerkUserId, staff))).length, 0);
  const lesson = await createLesson();
  assert.equal((await call(`/api/education/${lesson.slug}`, ids.alice)).status, 404);
  const draftDetail = await call(`/api/staff/education/${lesson.id}`, ids.author, { fresh: true });
  const revisionId = draftDetail.body.revisions[0].id;
  assert.equal((await call(`/api/staff/education/${lesson.id}/revisions/${revisionId}/submit-review`, ids.author, { method: "POST", fresh: true })).status, 200);
  assert.equal((await call(`/api/education/${lesson.slug}`, ids.alice)).status, 404);
});

test("capabilities, MFA, self-review, and publish evidence gates are enforced", async () => {
  for (const [index, invalidRevision] of [
    { sources: [] },
    { sources: [source("current_evidence", { rightsPermissions: "" })] },
    { region: "" },
    { educationalWording: "" },
  ].entries()) {
    const invalid = await call("/api/staff/education", ids.author, {
      method: "POST", fresh: true,
      body: { categoryId, slug: `invalid-gate-${randomUUID()}`, ...revisionBody(invalidRevision) },
    });
    if (index < 2) {
      assert.equal(invalid.status, 400);
    } else {
      assert.equal(invalid.status, 201);
      const invalidRevisionId = (await call(`/api/staff/education/${invalid.body.id}`, ids.author, { fresh: true })).body.revisions[0].id;
      await call(`/api/staff/education/${invalid.body.id}/revisions/${invalidRevisionId}/submit-review`, ids.author, { method: "POST", fresh: true });
      await call(`/api/staff/education/${invalid.body.id}/revisions/${invalidRevisionId}/approve`, ids.reviewer, { method: "POST", fresh: true });
      assert.equal((await call(`/api/staff/education/${invalid.body.id}/publish`, ids.publisher, { method: "POST", fresh: true })).status, 409);
    }
  }
  const lesson = await createLesson();
  const revisionId = (await call(`/api/staff/education/${lesson.id}`, ids.author, { fresh: true })).body.revisions[0].id;
  assert.equal((await call(`/api/staff/education/${lesson.id}/revisions/${revisionId}/submit-review`, ids.alice, { method: "POST", fresh: true })).status, 403);
  assert.equal((await call(`/api/staff/education/${lesson.id}/revisions/${revisionId}/submit-review`, ids.author, { method: "POST" })).status, 403);
  assert.equal((await call(`/api/staff/education/${lesson.id}/revisions/${revisionId}/submit-review`, ids.author, { method: "POST", fresh: true })).status, 200);
  assert.equal((await call(`/api/staff/education/${lesson.id}/revisions/${revisionId}/approve`, ids.author, { method: "POST", fresh: true })).status, 403);
  assert.equal((await call(`/api/staff/education/${lesson.id}/publish`, ids.publisher, { method: "POST", fresh: true })).status, 409);
  assert.equal((await call(`/api/staff/education/${lesson.id}/revisions/${revisionId}/approve`, ids.reviewer, { method: "POST", fresh: true })).status, 200);
  assert.equal((await call(`/api/staff/education/${lesson.id}/publish`, ids.publisher, { method: "POST" })).status, 403);
  assert.equal((await call(`/api/staff/education/${lesson.id}/publish`, ids.publisher, { method: "POST", fresh: true })).status, 200);
  const rejectLesson = await createLesson();
  const rejectRevision = (await call(`/api/staff/education/${rejectLesson.id}`, ids.author, { fresh: true })).body.revisions[0].id;
  await call(`/api/staff/education/${rejectLesson.id}/revisions/${rejectRevision}/submit-review`, ids.author, { method: "POST", fresh: true });
  assert.equal((await call(`/api/staff/education/${rejectLesson.id}/revisions/${rejectRevision}/reject`, ids.reviewer, { method: "POST", fresh: true, body: {} })).status, 400);
  assert.equal((await call(`/api/staff/education/${rejectLesson.id}/revisions/${rejectRevision}/reject`, ids.author, { method: "POST", fresh: true, body: { reason: "Needs revision" } })).status, 403);
  const rejected = await call(`/api/staff/education/${rejectLesson.id}/revisions/${rejectRevision}/reject`, ids.reviewer, { method: "POST", fresh: true, body: { reason: "Needs revision" } });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.status, "rejected");
  const rejectedDetail = await call(`/api/staff/education/${rejectLesson.id}`, ids.author, { fresh: true });
  assert.equal(rejectedDetail.body.lesson.status, "draft");
  assert.equal(rejectedDetail.body.lesson.currentRevisionId, rejectRevision);
  const historical = await createLesson(ids.author, revisionBody({ sources: [source("historical_population_research")] }));
  const historicalRevision = (await call(`/api/staff/education/${historical.id}`, ids.author, { fresh: true })).body.revisions[0].id;
  await call(`/api/staff/education/${historical.id}/revisions/${historicalRevision}/submit-review`, ids.author, { method: "POST", fresh: true });
  await call(`/api/staff/education/${historical.id}/revisions/${historicalRevision}/approve`, ids.reviewer, { method: "POST", fresh: true });
  assert.equal((await call(`/api/staff/education/${historical.id}/publish`, ids.publisher, { method: "POST", fresh: true })).status, 409);
  const pairedCurrent = source("current_evidence");
  const pairedHistorical = source("historical_population_research");
  const paired = await createLesson(ids.author, revisionBody({ sources: [pairedCurrent, pairedHistorical] }));
  assert.equal((await publish(paired.id)).revisionId.length > 0, true);
  const stale = await createLesson(ids.author, revisionBody({ sources: [source("current_evidence", {
    verifiedAt: "2020-01-01T00:00:00.000Z", evidenceCheckedAt: "2020-01-01T00:00:00.000Z",
  })] }));
  const staleRevision = (await call(`/api/staff/education/${stale.id}`, ids.author, { fresh: true })).body.revisions[0].id;
  await call(`/api/staff/education/${stale.id}/revisions/${staleRevision}/submit-review`, ids.author, { method: "POST", fresh: true });
  await call(`/api/staff/education/${stale.id}/revisions/${staleRevision}/approve`, ids.reviewer, { method: "POST", fresh: true });
  assert.equal((await call(`/api/staff/education/${stale.id}/publish`, ids.publisher, { method: "POST", fresh: true })).status, 409);
  for (const sourceOverrides of [
    { sourceDate: null },
    { sourceDate: "2030-01-01T00:00:00.000Z" },
    { sourceDate: "2010-01-01T00:00:00.000Z" },
  ]) {
    const dated = await createLesson(ids.author, revisionBody({ sources: [source("current_evidence", sourceOverrides)] }));
    const datedRevision = (await call(`/api/staff/education/${dated.id}`, ids.author, { fresh: true })).body.revisions[0].id;
    await call(`/api/staff/education/${dated.id}/revisions/${datedRevision}/submit-review`, ids.author, { method: "POST", fresh: true });
    await call(`/api/staff/education/${dated.id}/revisions/${datedRevision}/approve`, ids.reviewer, { method: "POST", fresh: true });
    assert.equal((await call(`/api/staff/education/${dated.id}/publish`, ids.publisher, { method: "POST", fresh: true })).status, 409);
  }
  const copied = await call("/api/staff/education", ids.author, {
    method: "POST", fresh: true, body: { categoryId, slug: `copied-${randomUUID()}`, ...revisionBody({
      body: "RESTRICTED-EXCERPT-DO-NOT-COPY", containsCopiedRestrictedContent: true,
    }) },
  });
  assert.equal(copied.status, 400);
});

test("approved current content has stable public detail/search and licensed links are not copied", async () => {
  const lesson = await createLesson(ids.author, revisionBody({
    body: "Neutral test text cites restricted material by link only and does not reproduce restricted text.",
    sources: [source("licensed_link", { url: "https://example.invalid/licensed-test", rightsStatus: "link_only" })],
  }));
  const published = await publish(lesson.id);
  const detail = await call(`/api/education/${published.slug}`, ids.alice);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.revision.sources[0].url, "https://example.invalid/licensed-test");
  assert.equal(detail.body.revision.body.includes("RESTRICTED-EXCERPT-DO-NOT-COPY"), false);
  assert.equal((await call(`/api/education/search?q=Neutral`, ids.alice)).status, 200);
  const noLink = await call("/api/staff/education", ids.author, { fresh: true });
  assert.equal(noLink.status, 200);
  const invalid = await call("/api/staff/education", ids.author, { method: "POST", fresh: true, body: {
    categoryId, slug: `invalid-${randomUUID()}`,
    ...revisionBody({ sources: [source("licensed_link", { url: "" })] }),
  } });
  assert.equal(invalid.status, 400);
});

test("private isolation, nullable progress, explicit opt-in disclaimer, export, and deletion cleanup", async () => {
  const lesson = await createLesson();
  const published = await publish(lesson.id);
  const save = await call(`/api/education/me/saves/${lesson.id}`, ids.alice, { method: "PUT" });
  assert.equal(save.status, 201);
  const progress = await call(`/api/education/me/progress/${lesson.id}`, ids.alice, { method: "PUT", body: { percent: null } });
  assert.equal(progress.status, 200);
  assert.equal(progress.body.percent, null);
  assert.equal(progress.body.completionOptIn, false);
  assert.equal((await call("/api/education/me", ids.bob)).body.saves.length, 0);
  assert.equal((await call("/api/education/me", ids.bob)).body.progress.length, 0);
  assert.equal((await call(`/api/education/me/progress/${lesson.id}`, ids.alice, { method: "PUT", body: { percent: 100, completed: true } })).status, 200);
  const optIn = await call(`/api/education/me/completion/${lesson.id}`, ids.alice, { method: "PUT", body: { optIn: true } });
  assert.equal(optIn.status, 200);
  assert.match(optIn.body.completionDisclaimer, /not a clinical qualification/i);
  assert.equal((await call("/api/education/completions", ids.alice)).body.items.length, 1);
  await db.insert(profilesTable).values([
    { id: randomUUID(), memberId: ids.alice, preferredName: "Neutral Alice", discoverable: true, visibility: { preferredName: "members" } },
    { id: randomUUID(), memberId: ids.bob, preferredName: "Neutral Bob", discoverable: true, visibility: { preferredName: "members" } },
  ]);
  assert.equal((await call(`/api/education/${lesson.id}/completions`, ids.bob)).body.items.length, 1);
  await db.insert(safetyRelationshipsTable).values({ id: randomUUID(), actorMemberId: ids.bob, targetMemberId: ids.alice, kind: "block" });
  assert.equal((await call(`/api/education/${lesson.id}/completions`, ids.bob)).body.items.length, 0);
  await db.delete(safetyRelationshipsTable).where(and(eq(safetyRelationshipsTable.actorMemberId, ids.bob), eq(safetyRelationshipsTable.targetMemberId, ids.alice)));
  await db.delete(profilesTable).where(inArray(profilesTable.memberId, [ids.alice, ids.bob]));
  assert.equal((await call(`/api/education/me/completion/${lesson.id}`, ids.alice, { method: "PUT", body: { optIn: false } })).body.completionOptIn, false);
  assert.equal((await call("/api/education/completions", ids.alice)).body.items.length, 0);
  const exported = await call("/api/profile/export", ids.alice);
  assert.equal(exported.body.educationSaves.some((row: any) => row.lessonId === lesson.id), true);
  const member = (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, ids.alice)).limit(1))[0];
  assert.equal((await call("/api/account/deletion", ids.alice, { method: "POST", fresh: true, body: {} })).status, 202);
  assert.equal((await db.select().from(educationSavesTable).where(eq(educationSavesTable.memberId, member.id))).length, 0);
  assert.equal((await db.select().from(educationProgressTable).where(eq(educationProgressTable.memberId, member.id))).length, 0);
  assert.equal((await db.select().from(educationRevisionsTable).where(eq(educationRevisionsTable.lessonId, lesson.id))).length > 0, true);
  assert.equal(published.slug.length > 0, true);
});

test("review due/archive/withdrawal preserve traceability and old links are not served", async () => {
  const lesson = await createLesson();
  const published = await publish(lesson.id);
  assert.equal((await call(`/api/staff/education/${lesson.id}/review-due`, ids.publisher, { method: "POST", fresh: true })).status, 200);
  assert.equal((await call(`/api/education/${published.slug}`, ids.alice)).body.reviewDue, true);
  assert.equal((await call(`/api/staff/education/${lesson.id}/archive`, ids.publisher, { method: "POST", fresh: true })).status, 200);
  assert.equal((await call(`/api/education/${published.slug}`, ids.alice)).status, 404);
  const replacement = await createLesson();
  const replacementPublished = await publish(replacement.id);
  const oldDetail = await call(`/api/staff/education/${replacement.id}`, ids.reviewer, { fresh: true });
  const oldBody = oldDetail.body.revisions[0].body;
  const newRevision = await call(`/api/staff/education/${replacement.id}/revisions`, ids.author, {
    method: "POST", fresh: true, body: revisionBody({ body: "Neutral revised test text." }),
  });
  assert.equal(newRevision.status, 201);
  const versioned = await call(`/api/staff/education/${replacement.id}`, ids.reviewer, { fresh: true });
  assert.equal(versioned.body.revisions.length, 2);
  assert.equal(versioned.body.revisions.find((row: any) => row.version === 1).body, oldBody);
  assert.equal((await call(`/api/staff/education/${replacement.id}/corrections`, ids.publisher, { method: "POST", fresh: true, body: { reason: "Neutral test correction" } })).status, 201);
  const generalCorrection = await call(`/api/staff/education/${replacement.id}/corrections`, ids.publisher, { method: "POST", fresh: true, body: { reason: "General lesson correction", revisionId: null } });
  assert.equal(generalCorrection.status, 201);
  assert.equal(generalCorrection.body.revisionId, null);
  assert.equal((await call(`/api/staff/education/${replacement.id}/corrections`, ids.publisher, { method: "POST", fresh: true, body: { reason: "Wrong revision", revisionId: randomUUID() } })).status, 400);
  assert.equal((await call(`/api/staff/education/${replacement.id}/withdraw`, ids.publisher, { method: "POST", fresh: true, body: { reason: "Neutral test withdrawal" } })).status, 200);
  assert.equal((await call(`/api/education/${replacementPublished.slug}`, ids.alice)).status, 404);
  assert.equal((await call(`/api/education/search?q=${encodeURIComponent(replacementPublished.slug)}`, ids.alice)).body.items.length, 0);
  const history = await call(`/api/staff/education/${replacement.id}`, ids.reviewer, { fresh: true });
  assert.equal(history.body.corrections.length, 3);
  assert.equal(history.body.revisions.length, 2);
});

test("locked publish and create-revision race leaves no superseded revision published", async () => {
  const lesson = await createLesson();
  await publish(lesson.id);
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const barrier = iteration === 0 ? armPhase11PublishBarrier() : null;
    const publishPromise = call(`/api/staff/education/${lesson.id}/publish${barrier ? "?phase11Barrier=publish" : ""}`, ids.publisher, { method: "POST", fresh: true });
    if (barrier) await barrier.reached;
    const createPromise = call(`/api/staff/education/${lesson.id}/revisions`, ids.author, { method: "POST", fresh: true, body: revisionBody({ body: `Neutral concurrent revision ${iteration}.` }) });
    if (barrier) barrier.release();
    const [createResult, publishResult] = await Promise.all([createPromise, publishPromise]);
    assert.ok([201, 409].includes(createResult.status));
    assert.ok([200, 409].includes(publishResult.status));
    const state = await db.select().from(educationLessonsTable).where(eq(educationLessonsTable.id, lesson.id)).limit(1);
    const current = state[0];
    assert.ok(current);
    if (current.status === "published") assert.equal(current.currentRevisionId, current.publishedRevisionId);
    if (createResult.status === 201) assert.notEqual(current.status, "published");
  }
});
