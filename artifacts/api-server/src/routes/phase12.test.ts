import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { createApp } from "../app.ts";
import { db, pool, membersTable, resourcesTable, resourceReportsTable, resourceEventsTable, staffRoleAssignmentsTable, postsTable, friendshipsTable } from "@workspace/db";

process.env.NODE_ENV = "test";
const ids = Object.fromEntries(["author", "reviewer", "member", "outsider"].map((name) => [name, `phase12-${name}-${randomUUID()}`])) as Record<"author" | "reviewer" | "member" | "outsider", string>;
const app = createApp({ authMiddleware: (req, _res, next) => {
  const userId = req.header("x-test-user") ?? null;
  Object.assign(req, { auth: Object.assign(() => ({
    userId, sessionId: userId ? `session-${userId}` : null, tokenType: "session_token",
    sessionClaims: { fva: [1, req.header("x-test-mfa") === "fresh" ? 1 : 10] },
  }), { [Symbol.for("@clerk/express.auth")]: true }) });
  next();
} });
let server: ReturnType<typeof app.listen>;
let base: string;
const created: string[] = [];
async function call(path: string, user?: string, method = "GET", body?: unknown, fresh = true) {
  const res = await fetch(`${base}${path}`, { method, headers: { ...(user ? { "x-test-user": user } : {}), ...(fresh ? { "x-test-mfa": "fresh" } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) as any, cache: res.headers.get("cache-control") };
}
const input = (extra = {}) => ({
  url: "https://example.org/resource", title: "Neutral external resource", category: "article",
  region: "Australia", sourceDate: null, preview: "An original neutral summary.", previewPermission: "Original summary by Me editor", embedAuthorized: false, ...extra,
});
async function draft(extra = {}) {
  const result = await call("/api/staff/resources", ids.author, "POST", input(extra));
  assert.equal(result.status, 201, JSON.stringify(result.body));
  created.push(result.body.id);
  return result.body;
}
async function fixtureCheck(id: string) {
  // Reachability fixture: safe transport/DNS is separately exercised by unit tests.
  await db.update(resourcesTable).set({ lastCheckedAt: new Date(), linkState: "reachable" }).where(eq(resourcesTable.id, id));
}
async function review(id: string) {
  return call(`/api/staff/resources/${id}/review`, ids.reviewer, "POST", { reviewerName: "Test source reviewer", note: "Source and rights checked, not every claim", rightsConfirmed: true });
}
before(async () => {
  await db.insert(membersTable).values(Object.values(ids).map((id) => ({ id, clerkUserId: id, emailVerified: true })));
  await db.insert(staffRoleAssignmentsTable).values([
    { id: randomUUID(), clerkUserId: ids.author, role: "education_editor", active: true, capabilities: ["education.author", "education.review"] },
    { id: randomUUID(), clerkUserId: ids.reviewer, role: "education_editor", active: true, capabilities: ["education.review", "education.publish"] },
  ]);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  if (created.length) {
    await db.delete(resourceReportsTable).where(inArray(resourceReportsTable.resourceId, created));
    await db.delete(resourceEventsTable).where(inArray(resourceEventsTable.resourceId, created));
    await db.delete(resourcesTable).where(inArray(resourcesTable.id, created));
  }
  await db.delete(postsTable).where(inArray(postsTable.authorMemberId, Object.values(ids)));
  await db.delete(friendshipsTable).where(eq(friendshipsTable.memberAId, [ids.author, ids.member].sort()[0]));
  await db.delete(staffRoleAssignmentsTable).where(inArray(staffRoleAssignmentsTable.clerkUserId, Object.values(ids)));
  await db.delete(membersTable).where(inArray(membersTable.id, Object.values(ids)));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});
test("all link categories, rights and HTTPS validation; fresh staff capability required", async () => {
  assert.equal((await call("/api/staff/resources", undefined)).status, 401);
  assert.equal((await call("/api/staff/resources", ids.member, "POST", input())).status, 403);
  assert.equal((await call("/api/staff/resources", ids.author, "POST", input(), false)).status, 403);
  for (const bad of [{ url: "http://example.org" }, { url: "https://127.0.0.1" }, { previewPermission: "" }, { url: "https://example.org", embedAuthorized: true }]) {
    assert.equal((await call("/api/staff/resources", ids.author, "POST", input(bad))).status, 400);
  }
  for (const category of ["article", "news", "podcast", "music", "video", "event", "helpline", "research", "organisation"]) {
    assert.equal((await draft({ category })).category, category);
  }
  assert.equal((await call("/api/staff/resources/preview", ids.author, "POST", { url: "https://169.254.169.254/" })).status, 400);
});
test("separate reviewer and recent safe check, attributed label, edits clear review", async () => {
  const row = await draft();
  assert.equal((await call(`/api/resources/${row.id}`)).status, 404);
  assert.equal((await review(row.id)).status, 409);
  await fixtureCheck(row.id);
  const self = await call(`/api/staff/resources/${row.id}/review`, ids.author, "POST", { reviewerName: "Self", note: "Check", rightsConfirmed: true });
  assert.equal(self.status, 403);
  assert.equal((await review(row.id)).status, 200);
  const publicDetail = await call(`/api/resources/${row.id}`);
  assert.equal(publicDetail.body.reviewedBy, "Test source reviewer");
  assert.ok(publicDetail.body.reviewedAt);
  assert.equal(publicDetail.cache, "no-store");
  assert.equal(publicDetail.body.editorId, undefined);
  assert.equal((await call("/api/resources?category=article&region=Australia&q=Neutral")).body.items.some((r: any) => r.id === row.id), true);
  assert.equal((await call(`/api/staff/resources/${row.id}`, ids.author, "PATCH", input({ title: "Changed" }))).status, 200);
  assert.equal((await call(`/api/resources/${row.id}`)).status, 404);
  assert.equal((await review(row.id)).status, 409);
});
test("authorised embeds, stale dates and unavailable checks suppress players", async () => {
  const row = await draft({ url: "https://www.youtube.com/watch?v=Abcdef12345", category: "video", embedAuthorized: true });
  await fixtureCheck(row.id);
  assert.equal((await review(row.id)).status, 200);
  assert.match((await call(`/api/resources/${row.id}`)).body.embedUrl, /^https:\/\/www.youtube-nocookie.com\/embed\//);
  await db.update(resourcesTable).set({ lastCheckedAt: new Date(Date.now() - 31 * 86400000) }).where(eq(resourcesTable.id, row.id));
  const stale = await call(`/api/resources/${row.id}`);
  assert.equal(stale.body.stale, true);
  assert.equal(stale.body.embedUrl, null);
  await db.update(resourcesTable).set({ linkState: "redirected", lastCheckedAt: new Date() }).where(eq(resourcesTable.id, row.id));
  assert.equal((await call(`/api/resources/${row.id}`)).body.embedUrl, null);
  const invalid = await draft();
  await db.update(resourcesTable).set({ url: "https://127.0.0.1/" }).where(eq(resourcesTable.id, invalid.id));
  const checked = await call(`/api/staff/resources/${invalid.id}/check`, ids.reviewer, "POST");
  assert.equal(checked.status, 200);
  assert.equal(checked.body.linkState, "unavailable");
});
test("member reporting, publisher removal and report resolution are persistent", async () => {
  const row = await draft();
  await fixtureCheck(row.id);
  await review(row.id);
  assert.equal((await call(`/api/resources/${row.id}/reports`, undefined, "POST", { reason: "Broken link" })).status, 401);
  const report = await call(`/api/resources/${row.id}/reports`, ids.member, "POST", { reason: "Broken link" });
  assert.equal(report.status, 201);
  assert.equal((await call(`/api/resources/${row.id}/reports`, ids.member, "POST", { reason: "Again" })).status, 409);
  assert.equal((await call("/api/staff/resource-reports", ids.member)).status, 403);
  assert.equal((await call(`/api/staff/resources/${row.id}/remove`, ids.author, "POST", { reason: "Remove" })).status, 403);
  assert.equal((await call(`/api/staff/resources/${row.id}/remove`, ids.reviewer, "POST", { reason: "Confirmed broken" })).status, 200);
  assert.equal((await call(`/api/resources/${row.id}`)).status, 404);
  assert.equal((await call("/api/resources")).body.items.some((r: any) => r.id === row.id), false);
  assert.equal((await call(`/api/staff/resource-reports/${report.body.id}/resolve`, ids.reviewer, "POST", { reason: "Resource removed" })).body.status, "resolved");
  assert.equal((await db.select().from(resourceEventsTable).where(eq(resourceEventsTable.resourceId, row.id))).length, 3);
});
test("external Me deep links require authentication and live original permissions", async () => {
  const postId = randomUUID();
  const reshareId = randomUUID();
  const [memberAId, memberBId] = [ids.author, ids.member].sort();
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId, memberBId });
  await db.insert(postsTable).values([
    { id: postId, authorMemberId: ids.author, body: "Private sentinel", status: "published", audience: "friends" },
    { id: reshareId, authorMemberId: ids.member, body: "Reference only", status: "published", audience: "public", originalPostId: postId },
  ]);
  assert.equal((await call(`/api/posts/${postId}`)).status, 401);
  assert.equal((await call(`/api/posts/${postId}`, ids.outsider)).status, 404);
  assert.equal((await call(`/api/posts/${postId}`, ids.member)).status, 200);
  assert.equal((await call(`/api/posts/${reshareId}`, ids.outsider)).status, 404);
  await db.delete(friendshipsTable).where(and(eq(friendshipsTable.memberAId, memberAId), eq(friendshipsTable.memberBId, memberBId)));
  assert.equal((await call(`/api/posts/${postId}`, ids.member)).status, 404);
  assert.equal((await call(`/api/posts/${reshareId}`, ids.member)).status, 404);
});
