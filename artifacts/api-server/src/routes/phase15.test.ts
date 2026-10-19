import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, pool, membersTable, postsTable, staffRoleAssignmentsTable, translationsTable,
  translationReportsTable, experiencePreferencesTable, experienceDraftsTable,
  educationCategoriesTable, educationLessonsTable, educationRevisionsTable } from "@workspace/db";
import { createApp } from "../app";
import { runDeletionHooks } from "../lib/deletion-hooks";
import { inQuietHours, validQuietTime } from "../lib/quiet-hours";
import { enabledLocale, validTimeZone } from "../lib/experience-catalogue";

const ids = Object.fromEntries(["alice", "bob", "reviewer", "publisher"].map(k => [k, `p15-${k}-${randomUUID()}`])) as Record<"alice"|"bob"|"reviewer"|"publisher", string>;
const users = Object.values(ids), lessons: string[] = [], categories: string[] = [];
const app = createApp({ authMiddleware: (req: any, _res: any, next: any) => {
  const userId = req.header("x-test-user") || null;
  req.auth = Object.assign(() => ({ userId, tokenType: "session_token", sessionClaims: { fva: req.header("x-no-mfa") ? null : [0, 0] } }),
    { [Symbol.for("@clerk/express.auth")]: true }); next();
} });
let server: ReturnType<typeof app.listen>, base = "";
async function call(path: string, who = ids.alice, method = "GET", body?: unknown, noMfa = false) {
  const r = await fetch(`${base}/api${path}`, { method, headers: { "x-test-user": who, ...(noMfa ? { "x-no-mfa": "1" } : {}),
    ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) as any, cache: r.headers.get("cache-control") };
}
async function story(audience: "public" | "only_me" = "public") {
  const [p] = await db.insert(postsTable).values({ id: randomUUID(), authorMemberId: ids.alice, body: "Original chosen story",
    audience, status: "published", createdAt: new Date("2001-01-01"), publishedAt: new Date("2001-01-01") }).returning();
  return p;
}
async function proposal(sourceId: string, sourceType: "post" | "lesson" = "post") {
  const r = await call("/translations", ids.alice, "POST", { sourceType, sourceId, locale: "en-US",
    text: "A submitted English rendering", machineTranslated: true, rightsConfirmed: true });
  assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
}
const review = (id: string, action: string, who: string, noMfa = false) =>
  call(`/staff/translations/${id}/review`, who, "POST", { action, note: "Independent language and meaning review." }, noMfa);
async function clean() {
  await db.delete(translationReportsTable).where(inArray(translationReportsTable.memberId, users));
  await db.delete(translationsTable).where(inArray(translationsTable.authorMemberId, users));
  await db.delete(experiencePreferencesTable).where(inArray(experiencePreferencesTable.memberId, users));
  await db.delete(experienceDraftsTable).where(inArray(experienceDraftsTable.memberId, users));
  await db.delete(postsTable).where(inArray(postsTable.authorMemberId, users));
  if (lessons.length) {
    await db.delete(educationRevisionsTable).where(inArray(educationRevisionsTable.lessonId, lessons));
    await db.delete(educationLessonsTable).where(inArray(educationLessonsTable.id, lessons));
  }
  if (categories.length) await db.delete(educationCategoriesTable).where(inArray(educationCategoriesTable.id, categories));
}
before(async () => {
  process.env.NODE_ENV = "test";
  await db.insert(membersTable).values(users.map(id => ({ id, clerkUserId: id, emailVerified: true })));
  await db.insert(staffRoleAssignmentsTable).values([
    { id: randomUUID(), clerkUserId: ids.alice, role: "education_editor", capabilities: ["education.review", "education.publish"] },
    { id: randomUUID(), clerkUserId: ids.reviewer, role: "education_editor", capabilities: ["education.review"] },
    { id: randomUUID(), clerkUserId: ids.publisher, role: "education_editor", capabilities: ["education.publish"] },
  ]);
  server = app.listen(0); await new Promise<void>(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
beforeEach(clean);
after(async () => {
  await clean(); await db.delete(staffRoleAssignmentsTable).where(inArray(staffRoleAssignmentsTable.clerkUserId, users));
  await db.delete(membersTable).where(inArray(membersTable.id, users));
  await new Promise<void>(r => server.close(() => r())); await pool.end();
});

test("only reviewed English locales are enabled; preference changes persist and stay account scoped", async () => {
  assert.ok(enabledLocale("en-GB")); assert.ok(!enabledLocale("ar")); assert.ok(!validTimeZone("Mars/Olympus"));
  const r = await call("/experience/preferences", ids.alice, "PATCH", { locale: "en-US", timeZone: "America/New_York", direction: "rtl", lowData: false, country: "US" });
  assert.equal(r.status, 200); assert.match(r.cache!, /no-store/);
  assert.equal((await call("/experience/preferences")).body.timeZone, "America/New_York");
  assert.equal((await call("/experience/preferences", ids.bob)).body.locale, "en-AU");
  assert.equal((await call("/experience/preferences", ids.alice, "PATCH", { locale: "ar" })).status, 400);
  assert.equal((await call("/experience/preferences", ids.alice, "PATCH", { timeZone: "invalid" })).status, 400);
  assert.equal((await call("/experience/preferences", "", "PATCH", { locale: "en-US" })).status, 401);
});
test("unpublished drafts are isolated, survive reload and export, and are deleted without publication", async () => {
  assert.equal((await call("/experience/draft", ids.alice, "PUT", { body: "Private unsent words", audience: "only_me" })).status, 200);
  assert.equal((await call("/experience/draft", ids.bob)).body.draft, null);
  assert.equal((await call("/experience/draft")).body.draft.body, "Private unsent words");
  const exported = await call("/profile/export");
  assert.equal(exported.body.experienceData.draft.body, "Private unsent words");
  assert.equal((await db.select().from(postsTable).where(eq(postsTable.authorMemberId, ids.alice))).length, 0);
  assert.equal((await call("/experience/draft", ids.alice, "DELETE")).status, 204);
  assert.equal((await call("/experience/draft")).body.draft, null);
});
test("quiet hours validate time ranges, support partial updates and respect overnight and DST wall time", async () => {
  assert.equal(validQuietTime("24:30"), false); assert.equal(validQuietTime("22:60"), false);
  const q = { quietHoursEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "08:00", quietHoursTimezone: "Europe/London" };
  assert.equal(inQuietHours(q, new Date("2026-07-01T21:30:00Z")), true);
  assert.equal(inQuietHours(q, new Date("2026-01-01T21:30:00Z")), false);
  assert.equal(inQuietHours(q, new Date("2026-03-29T01:30:00Z")), true);
  assert.equal(inQuietHours(q, new Date("2026-07-01T07:00:00Z")), false);
  assert.equal((await call("/notification-preferences", ids.alice, "PATCH", { ...q, quietHoursStart: "99:00" })).status, 400);
  assert.equal((await call("/notification-preferences", ids.alice, "PATCH", q)).status, 200);
  assert.equal((await call("/notification-preferences", ids.alice, "PATCH", { quietHoursEnd: "07:30" })).status, 200);
  assert.equal((await call("/notification-preferences", ids.alice, "PATCH", { quietHoursTimezone: null })).status, 400);
});
test("directory uses explicitly chosen country, real checked hours and local emergency numbers", async () => {
  const gb = await call("/country-resources?country=GB");
  assert.equal(gb.status, 200); assert.match(gb.body.disclaimer, /not an emergency service/);
  assert.equal(gb.body.items.find((x: any) => x.kind === "emergency").phone, "999");
  assert.match(gb.body.items.find((x: any) => x.kind === "dementia").hours, /09:00/);
  for (const i of gb.body.items) { assert.ok(i.sourceUrl.startsWith("https://")); assert.ok(i.checkedAt); }
  assert.equal((await call("/country-resources?country=ZZ")).status, 400);
  assert.equal((await call("/country-resources")).status, 400);
});
test("translations remain pending, retain original, label machine provenance, and require rights", async () => {
  const p = await story(); const t = await proposal(p.id);
  assert.equal(t.status, "pending"); assert.equal(t.machineTranslated, true);
  const own = await call(`/translations?sourceType=post&sourceId=${p.id}`);
  assert.equal(own.body.providerEnabled, false); assert.equal(own.body.items.length, 1);
  assert.equal((await call(`/translations?sourceType=post&sourceId=${p.id}`, ids.bob)).body.items.length, 0);
  assert.equal((await db.select().from(postsTable).where(eq(postsTable.id, p.id)))[0].body, p.body);
  assert.equal((await call("/translations", ids.alice, "POST", { sourceType: "post", sourceId: p.id, locale: "en-US", text: "Test", machineTranslated: false })).status, 400);
});
test("independent capability and MFA review precede publication; reporting and corrections preserve provenance", async () => {
  const p = await story(); const t = await proposal(p.id);
  assert.equal((await review(t.id, "review", ids.alice)).status, 409);
  assert.equal((await review(t.id, "review", ids.reviewer, true)).status, 403);
  assert.equal((await review(t.id, "publish", ids.publisher)).status, 409);
  assert.equal((await review(t.id, "review", ids.reviewer)).status, 200);
  assert.equal((await review(t.id, "publish", ids.reviewer)).status, 403);
  assert.equal((await review(t.id, "publish", ids.publisher)).status, 200);
  assert.equal((await call(`/translations?sourceType=post&sourceId=${p.id}`, ids.bob)).body.items[0].status, "published");
  assert.equal((await call(`/translations/${t.id}/reports`, ids.bob, "POST", { reason: "Meaning may be inaccurate" })).status, 201);
  const queue = await call("/staff/translations", ids.reviewer);
  assert.equal(queue.body.items[0].reports[0].reason, "Meaning may be inaccurate");
  const correction = await call("/translations", ids.bob, "POST", { sourceType: "post", sourceId: p.id, locale: "en-US", text: "Proposed correction",
    correctionOf: t.id, machineTranslated: false, rightsConfirmed: true });
  assert.equal(correction.status, 201); assert.equal(correction.body.machineTranslated, true);
});
test("private originals never gain translation access; changes and revoked audience hide translated text", async () => {
  const p = await story("only_me"); await proposal(p.id);
  assert.equal((await call(`/translations?sourceType=post&sourceId=${p.id}`, ids.bob)).status, 404);
  assert.equal((await call("/staff/translations", ids.reviewer)).body.items.length, 0);
  await db.update(postsTable).set({ body: "Edited original" }).where(eq(postsTable.id, p.id));
  assert.deepEqual((await call(`/translations?sourceType=post&sourceId=${p.id}`)).body.items, []);
  const publicSource = await story();
  const borrowed = await call("/translations", ids.bob, "POST", { sourceType: "post", sourceId: publicSource.id,
    locale: "en-GB", text: "Borrowed-source translation", machineTranslated: false, rightsConfirmed: true });
  assert.equal(borrowed.status, 201);
  await db.update(postsTable).set({ audience: "only_me" }).where(eq(postsTable.id, publicSource.id));
  const exported = (await call("/profile/export", ids.bob)).body.experienceData.translations;
  assert.deepEqual(exported.find((row: any) => row.id === borrowed.body.id), { id: borrowed.body.id, unavailable: true });
  assert.equal(JSON.stringify(exported).includes("Borrowed-source translation"), false);
});
test("translated health education binds published revision, independent review and live withdrawal", async () => {
  const categoryId = randomUUID(), lessonId = randomUUID(), revisionId = randomUUID();
  categories.push(categoryId); lessons.push(lessonId);
  await db.insert(educationCategoriesTable).values({ id: categoryId, slug: `p15-${categoryId}`, name: "Test category" });
  await db.insert(educationLessonsTable).values({ id: lessonId, categoryId, slug: `p15-${lessonId}`, title: "Support education", authorClerkUserId: ids.alice,
    status: "published", publishedRevisionId: revisionId, publishedAt: new Date(), reviewDueAt: new Date(Date.now() + 86400000) });
  await db.insert(educationRevisionsTable).values({ id: revisionId, lessonId, version: 1, title: "Support education", summary: "General information", body: "Test educational original.",
    region: "Global", educationalWording: "Not individual advice", authorClerkUserId: ids.alice, status: "published" });
  const t = await proposal(lessonId, "lesson");
  assert.equal((await review(t.id, "publish", ids.publisher)).status, 409);
  assert.equal((await review(t.id, "review", ids.reviewer)).status, 200);
  assert.equal((await review(t.id, "publish", ids.publisher)).status, 200);
  await db.update(educationLessonsTable).set({ withdrawnAt: new Date() }).where(eq(educationLessonsTable.id, lessonId));
  assert.equal((await call(`/translations?sourceType=lesson&sourceId=${lessonId}`, ids.bob)).status, 404);
});
test("deletion hooks remove account settings, drafts and authored translations; inactive users cannot rewrite", async () => {
  const p = await story(); await proposal(p.id);
  await call("/experience/preferences", ids.alice, "PATCH", { offlineDrafts: true });
  await call("/experience/draft", ids.alice, "PUT", { body: "Discard me", audience: "only_me" });
  await db.update(membersTable).set({ active: false }).where(eq(membersTable.id, ids.alice));
  await runDeletionHooks({ memberId: ids.alice, requestId: randomUUID() });
  assert.equal((await db.select().from(experienceDraftsTable).where(eq(experienceDraftsTable.memberId, ids.alice))).length, 0);
  assert.equal((await db.select().from(translationsTable).where(eq(translationsTable.authorMemberId, ids.alice))).length, 0);
  assert.equal((await call("/experience/draft", ids.alice, "PUT", { body: "Late write", audience: "only_me" })).status, 403);
  await db.update(membersTable).set({ active: true }).where(eq(membersTable.id, ids.alice));
});
