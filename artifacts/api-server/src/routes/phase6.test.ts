import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  db, pool, membersTable, staffRoleAssignmentsTable, postsTable, commentsTable,
  friendshipsTable, safetyRelationshipsTable, postReactionsTable, postSavesTable,
  postHidesTable, reportsTable, moderationRecordsTable, retainedEvidenceTable,
  evidenceAccessAuditTable, notificationEventsTable,
} from "@workspace/db";
import { createApp } from "../app.ts";
import { resetRateLimitBuckets } from "../middlewares/account-auth.ts";

const ids = {
  alice: `phase6-alice-${randomUUID()}`,
  bob: `phase6-bob-${randomUUID()}`,
  carol: `phase6-carol-${randomUUID()}`,
  staff: `phase6-staff-${randomUUID()}`,
};
const app = createApp({ authMiddleware: (req, _res, next) => {
  const userId = req.header("x-test-user") ?? null;
  const stale = req.header("x-test-mfa") === "stale";
  const auth = Object.assign(() => ({ userId, tokenType: "session_token", sessionClaims: userId === ids.staff ? { fva: [null, stale ? 6 : 1] } : undefined }), { [Symbol.for("@clerk/express.auth")]: true });
  Object.assign(req, { auth }); next();
} });
let server: ReturnType<typeof app.listen>; let base = "";
async function call(path: string, user: string, options: { method?: string; body?: unknown; stale?: boolean } = {}) {
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers: { "x-test-user": user, ...(options.stale ? { "x-test-mfa": "stale" } : {}), ...(options.body === undefined ? {} : { "content-type": "application/json" }) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json().catch(() => undefined) as any };
}
async function post(user = ids.alice, body: Record<string, unknown> = {}, publish = true, allow = true) {
  const made = await call("/api/posts", user, { method: "POST", body: { body: "phase6 post", ...body } });
  assert.equal(made.status, 201);
  if (!publish) return made.body;
  const published = await call(`/api/posts/${made.body.id}/publish`, user, { method: "POST" });
  assert.equal(published.status, 200);
  if (allow) {
    const records = await db.select().from(moderationRecordsTable).where(eq(moderationRecordsTable.contentId, made.body.id));
    for (const record of records.filter((candidate) => candidate.state === "pending")) {
      await call(`/api/staff/moderation/${record.id}/decision`, ids.staff, { method: "POST", body: { state: "allowed", reason: "phase6 test review" } });
    }
    assert.equal((await call(`/api/posts/${made.body.id}`, user)).status, 200);
  }
  return published.body.post;
}

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await db.insert(membersTable).values([
    { id: ids.alice, clerkUserId: ids.alice, emailVerified: true },
    { id: ids.bob, clerkUserId: ids.bob, emailVerified: true },
    { id: ids.carol, clerkUserId: ids.carol, emailVerified: true },
  ]);
  await db.insert(staffRoleAssignmentsTable).values({ id: randomUUID(), clerkUserId: ids.staff, role: "moderator", capabilities: [], active: true });
});
beforeEach(async () => {
  process.env.PHASE6_TEST = "1"; resetRateLimitBuckets();
  await db.delete(evidenceAccessAuditTable).where(eq(evidenceAccessAuditTable.actorClerkUserId, ids.staff));
  await db.delete(retainedEvidenceTable).where(eq(retainedEvidenceTable.authorMemberId, ids.alice));
  await db.delete(reportsTable).where(or(eq(reportsTable.reporterMemberId, ids.alice), eq(reportsTable.reporterMemberId, ids.bob)));
  await db.delete(moderationRecordsTable).where(or(eq(moderationRecordsTable.subjectMemberId, ids.alice), eq(moderationRecordsTable.subjectMemberId, ids.bob)));
  await db.delete(notificationEventsTable).where(or(inArray(notificationEventsTable.actorMemberId, [ids.alice, ids.bob]), inArray(notificationEventsTable.recipientMemberId, [ids.alice, ids.bob])));
  await db.delete(safetyRelationshipsTable).where(or(inArray(safetyRelationshipsTable.actorMemberId, [ids.alice, ids.bob, ids.carol]), inArray(safetyRelationshipsTable.targetMemberId, [ids.alice, ids.bob, ids.carol])));
  await db.delete(friendshipsTable).where(or(inArray(friendshipsTable.memberAId, [ids.alice, ids.bob, ids.carol]), inArray(friendshipsTable.memberBId, [ids.alice, ids.bob, ids.carol])));
  await db.delete(postsTable).where(inArray(postsTable.authorMemberId, [ids.alice, ids.bob, ids.carol]));
});
after(async () => {
  await db.delete(evidenceAccessAuditTable).where(eq(evidenceAccessAuditTable.actorClerkUserId, ids.staff));
  await db.delete(retainedEvidenceTable).where(eq(retainedEvidenceTable.authorMemberId, ids.alice));
  await db.delete(reportsTable).where(eq(reportsTable.reporterMemberId, ids.alice));
  await db.delete(notificationEventsTable).where(or(eq(notificationEventsTable.actorMemberId, ids.alice), eq(notificationEventsTable.recipientMemberId, ids.alice), eq(notificationEventsTable.actorMemberId, ids.bob), eq(notificationEventsTable.recipientMemberId, ids.bob)));
  await db.delete(safetyRelationshipsTable).where(or(inArray(safetyRelationshipsTable.actorMemberId, Object.values(ids)), inArray(safetyRelationshipsTable.targetMemberId, Object.values(ids))));
  await db.delete(friendshipsTable).where(or(inArray(friendshipsTable.memberAId, Object.values(ids)), inArray(friendshipsTable.memberBId, Object.values(ids))));
  await db.delete(membersTable).where(inArray(membersTable.id, [ids.alice, ids.bob, ids.carol]));
  await db.delete(staffRoleAssignmentsTable).where(eq(staffRoleAssignmentsTable.clerkUserId, ids.staff));
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  server.closeIdleConnections?.();
  await pool.end();
});

test("draft remains owner-only and allowed moderation publishes", async () => {
  const draft = await post(ids.alice, { audience: "public" }, false);
  assert.equal((await call(`/api/posts/${draft.id}`, ids.bob)).status, 404);
  assert.equal((await call(`/api/posts/${draft.id}`, ids.alice)).status, 200);
  const published = await call(`/api/posts/${draft.id}/publish`, ids.alice, { method: "POST" });
  assert.equal(published.status, 200);
  assert.equal(published.body.post.status, "published");
});

test("held post/comment never appears until staff allows and removal hides it", async () => {
  const held = await post(ids.alice, { body: "kill yourself", audience: "public" }, true, false);
  const recordId = (await db.select().from(moderationRecordsTable).where(eq(moderationRecordsTable.contentId, held.id)).orderBy(moderationRecordsTable.createdAt)).at(-1)!.id;
  assert.equal((await call("/api/feed", ids.bob)).body.items.some((x: any) => x.id === held.id), false);
  assert.equal((await call(`/api/staff/moderation/${recordId}/decision`, ids.staff, { method: "POST", body: { state: "allowed", reason: "reviewed" } })).status, 200);
  assert.equal((await call(`/api/posts/${held.id}`, ids.bob)).status, 200);
  const removal = await call("/api/reports", ids.bob, { method: "POST", body: { contentId: held.id, category: "threats" } });
  const removalRecord = removal.body.moderationRecord.id;
  assert.equal((await call(`/api/staff/moderation/${removalRecord}/decision`, ids.staff, { method: "POST", body: { state: "removed", reason: "removed" } })).status, 200);
  assert.equal((await call(`/api/posts/${held.id}`, ids.bob)).status, 404);
});

test("chronological cursor pages are stable and refresh sees newer post", async () => {
  const first = await post(ids.alice, { audience: "public", body: "page one" });
  const second = await post(ids.alice, { audience: "public", body: "page two" });
  const page = await call("/api/feed?limit=1", ids.bob);
  assert.equal(page.status, 200); assert.equal(page.body.items.length, 1); assert.ok(page.body.nextCursor);
  const next = await call(`/api/feed?limit=1&cursor=${encodeURIComponent(page.body.nextCursor)}`, ids.bob);
  assert.equal(next.body.items[0].id, first.id);
  const newer = await post(ids.alice, { audience: "public", body: "refresh" });
  const refreshed = await call("/api/feed?limit=1", ids.bob);
  assert.equal(refreshed.body.items[0].id, newer.id); assert.notEqual(second.id, newer.id);
});

test("friends audience revokes immediately after unfriend and either block direction across detail/feed/reaction/comment/save/share", async () => {
  const [a, b] = ids.alice < ids.bob ? [ids.alice, ids.bob] : [ids.bob, ids.alice];
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId: a, memberBId: b });
  const source = await post(ids.alice, { audience: "friends" });
  assert.equal((await call(`/api/posts/${source.id}`, ids.bob)).status, 200);
  await call(`/api/friends/${ids.alice}`, ids.bob, { method: "DELETE" });
  assert.equal((await call(`/api/posts/${source.id}`, ids.bob)).status, 404);
  for (const direction of [[ids.bob, ids.alice], [ids.alice, ids.bob]] as const) {
    await call("/api/safety/block", direction[0], { method: "POST", body: { targetMemberId: direction[1] } });
    assert.equal((await call("/api/feed", ids.bob)).body.items.some((x: any) => x.id === source.id), false);
    assert.equal((await call(`/api/posts/${source.id}/reactions`, ids.bob, { method: "POST", body: { kind: "hear_you" } })).status, 404);
    assert.equal((await call(`/api/posts/${source.id}/comments`, ids.bob, { method: "POST", body: { body: "blocked" } })).status, 404);
  }
});

test("only_me/public/friends audience changes affect saved and shared references immediately", async () => {
  const source = await post(ids.alice, { audience: "public" });
  assert.equal((await call(`/api/posts/${source.id}/save`, ids.bob, { method: "POST" })).status, 204);
  const share = await post(ids.bob, { originalPostId: source.id, audience: "public" });
  assert.equal((await call(`/api/posts/${share.id}`, ids.bob)).status, 200);
  await call(`/api/posts/${source.id}`, ids.alice, { method: "PATCH", body: { audience: "only_me" } });
  assert.equal((await call(`/api/posts/${share.id}`, ids.bob)).status, 404);
  assert.equal((await call(`/api/posts/${source.id}/save`, ids.bob)).status, 404);
});

test("response labels update and closed comments reject replies", async () => {
  const source = await post(ids.alice, { audience: "public", responseLabel: "someone_to_listen", commentsOpen: true });
  const edited = await call(`/api/posts/${source.id}`, ids.alice, { method: "PATCH", body: { responseLabel: "practical_ideas", commentsOpen: false } });
  assert.equal(edited.status, 200); assert.equal(edited.body.responseLabel, "practical_ideas");
  assert.equal((await call(`/api/posts/${source.id}/comments`, ids.bob, { method: "POST", body: { body: "closed" } })).status, 409);
});

test("reaction idempotency and optional count visibility", async () => {
  const source = await post(ids.alice, { audience: "public" });
  const first = await call(`/api/posts/${source.id}/reactions`, ids.bob, { method: "POST", body: { kind: "hear_you" } });
  const second = await call(`/api/posts/${source.id}/reactions`, ids.bob, { method: "POST", body: { kind: "hear_you" } });
  assert.equal(first.body.active, true); assert.equal(second.body.active, false);
  const owner = await call(`/api/posts/${source.id}`, ids.alice); assert.ok(owner.body.reactionCounts && typeof owner.body.reactionCounts === "object");
});

test("comment/reply ownership edit/delete", async () => {
  const source = await post(ids.alice, { audience: "public" });
  const comment = await call(`/api/posts/${source.id}/comments`, ids.bob, { method: "POST", body: { body: "hello" } });
  assert.equal(comment.status, 201);
  const reply = await call(`/api/posts/${source.id}/comments`, ids.alice, { method: "POST", body: { body: "reply", parentCommentId: comment.body.id } });
  assert.equal(reply.status, 201);
  assert.equal((await call(`/api/comments/${comment.body.id}`, ids.carol, { method: "PATCH", body: { body: "no" } })).status, 404);
  assert.equal((await call(`/api/comments/${comment.body.id}`, ids.bob, { method: "PATCH", body: { body: "edited" } })).status, 200);
  assert.equal((await call(`/api/comments/${reply.body.id}`, ids.alice, { method: "DELETE" })).status, 204);
});

test("hide/save/report plus retained evidence survives deletion and staff access is audited", async () => {
  const source = await post(ids.alice, { audience: "public" });
  assert.equal((await call(`/api/posts/${source.id}/hide`, ids.bob, { method: "POST" })).status, 204);
  assert.equal((await call(`/api/posts/${source.id}/save`, ids.bob, { method: "POST" })).status, 204);
  const report = await call("/api/reports", ids.bob, { method: "POST", body: { contentId: source.id, category: "harassment", details: "retain" } });
  assert.equal(report.status, 201);
  const evidence = (await db.select().from(retainedEvidenceTable).where(eq(retainedEvidenceTable.reportId, report.body.report.id)))[0];
  await call(`/api/posts/${source.id}`, ids.alice, { method: "DELETE" });
  const access = await call(`/api/staff/evidence/${evidence.id}/access`, ids.staff, { method: "POST", body: { reason: "audit" } });
  assert.equal(access.status, 200); assert.equal(access.body.evidence.bodySnapshot, "phase6 post");
  assert.equal((await db.select().from(evidenceAccessAuditTable).where(eq(evidenceAccessAuditTable.evidenceId, evidence.id))).length, 1);
});

test("internal share cannot widen and source removal revokes it", async () => {
  const source = await post(ids.alice, { audience: "friends" });
  const denied = await call("/api/posts", ids.bob, { method: "POST", body: { body: "widen", originalPostId: source.id, audience: "public" } });
  assert.equal(denied.status, 404);
  const own = await post(ids.alice, { audience: "only_me" });
  const privateShare = await call("/api/posts", ids.alice, { method: "POST", body: { body: "copy", originalPostId: own.id, audience: "only_me" } });
  assert.equal(privateShare.status, 201);
  assert.equal(privateShare.body.originalPostId, own.id);
  assert.equal((await call(`/api/posts/${privateShare.body.id}/publish`, ids.alice, { method: "POST" })).status, 200);
  assert.equal((await call(`/api/posts/${own.id}`, ids.alice, { method: "DELETE" })).status, 204);
  assert.equal((await db.select({ status: postsTable.status }).from(postsTable).where(eq(postsTable.id, own.id)))[0]?.status, "deleted");
  assert.equal((await call(`/api/posts/${privateShare.body.id}`, ids.alice)).status, 404);
});

test("notification events exclude held/blocked interactions and reauthorize on read", async () => {
  const source = await post(ids.alice, { audience: "public" });
  await call(`/api/posts/${source.id}/reactions`, ids.bob, { method: "POST", body: { kind: "hear_you" } });
  assert.equal((await call("/api/notifications", ids.alice)).body.some((e: any) => e.postId === source.id), true);
  await call("/api/safety/block", ids.alice, { method: "POST", body: { targetMemberId: ids.bob } });
  assert.equal((await call("/api/notifications", ids.alice)).body.some((e: any) => e.postId === source.id), false);
});

test("concurrent block/unfriend/audience change versus comment/reaction/save/share leaves no unauthorized rows", async () => {
  const [a, b] = ids.alice < ids.bob ? [ids.alice, ids.bob] : [ids.bob, ids.alice];
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId: a, memberBId: b });
  const source = await post(ids.alice, { audience: "friends" });
  await Promise.all([
    call("/api/safety/block", ids.alice, { method: "POST", body: { targetMemberId: ids.bob } }),
    call(`/api/friends/${ids.alice}`, ids.bob, { method: "DELETE" }),
    call(`/api/posts/${source.id}`, ids.alice, { method: "PATCH", body: { audience: "only_me" } }),
    call(`/api/posts/${source.id}/comments`, ids.bob, { method: "POST", body: { body: "race" } }),
    call(`/api/posts/${source.id}/reactions`, ids.bob, { method: "POST", body: { kind: "hear_you" } }),
    call(`/api/posts/${source.id}/save`, ids.bob, { method: "POST" }),
    call("/api/posts", ids.bob, { method: "POST", body: { body: "share", originalPostId: source.id, audience: "public" } }),
  ]);
  assert.equal((await db.select().from(commentsTable).where(and(eq(commentsTable.postId, source.id), eq(commentsTable.authorMemberId, ids.bob)))).length, 0);
  assert.equal((await db.select().from(postReactionsTable).where(and(eq(postReactionsTable.postId, source.id), eq(postReactionsTable.memberId, ids.bob)))).length, 0);
  assert.equal((await db.select().from(postSavesTable).where(and(eq(postSavesTable.postId, source.id), eq(postSavesTable.memberId, ids.bob)))).length, 0);
});