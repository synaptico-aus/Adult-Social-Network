import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { createApp } from "../app.ts";
import { resetRateLimitBuckets } from "../middlewares/account-auth.ts";
import {
  db, pool, membersTable, profilesTable, groupsTable, groupMembersTable,
  groupMembershipRequestsTable, groupWelcomeRequestsTable,
  postsTable, communityHostTrainingTable, safetyRelationshipsTable,
} from "@workspace/db";

const ids = { owner: `phase9-owner-${randomUUID()}`, member: `phase9-member-${randomUUID()}`, other: `phase9-other-${randomUUID()}` };
const app = createApp({ authMiddleware: (req, _res, next) => { const userId = req.header("x-test-user") ?? null; Object.assign(req, { auth: Object.assign(() => ({ userId, tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true }) }); next(); } });
let server: ReturnType<typeof app.listen>; let base = "";
async function call(path: string, user: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${base}${path}`, { method: options.method ?? "GET", headers: { "x-test-user": user, ...(options.body === undefined ? {} : { "content-type": "application/json" }) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  return { status: response.status, body: await response.json().catch(() => undefined) as any };
}
async function createGroup(user = ids.owner, extra: Record<string, unknown> = {}) {
  const result = await call("/api/groups", user, { method: "POST", body: { name: `Phase 9 ${randomUUID()}`, category: "carers", ...extra } });
  assert.equal(result.status, 201);
  return result.body;
}
before(async () => {
  server = app.listen(0); await new Promise<void>((resolve) => server.once("listening", resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await db.insert(membersTable).values(Object.values(ids).map((id) => ({ id, clerkUserId: id, emailVerified: true })));
});
beforeEach(async () => {
  process.env.PHASE6_TEST = "1";
  resetRateLimitBuckets();
  await db.delete(groupsTable).where(eq(groupsTable.ownerMemberId, ids.owner));
  await db.delete(safetyRelationshipsTable).where(inArray(safetyRelationshipsTable.actorMemberId, Object.values(ids)));
  await db.delete(communityHostTrainingTable).where(inArray(communityHostTrainingTable.memberId, Object.values(ids)));
  await db.delete(profilesTable).where(inArray(profilesTable.memberId, Object.values(ids)));
});
after(async () => {
  await db.delete(groupsTable).where(eq(groupsTable.ownerMemberId, ids.owner));
  await db.delete(membersTable).where(inArray(membersTable.id, Object.values(ids)));
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
});

test("approval membership is accountable and removal revokes group posts", async () => {
  const g = await createGroup(ids.owner, { joinPolicy: "approval", contentVisibility: "members" });
  const request = await call(`/api/groups/${g.id}/join`, ids.member, { method: "POST" });
  assert.equal(request.status, 202);
  const approved = await call(`/api/groups/${g.id}/requests/${request.body.id}/approve`, ids.owner, { method: "POST" });
  assert.equal(approved.status, 200);
  const post = await call("/api/posts", ids.member, { method: "POST", body: { body: "group post", audience: "this_group", groupId: g.id, isIntroduction: true } });
  assert.equal(post.status, 201);
  assert.equal(post.body.isIntroduction, true);
  assert.equal((await call(`/api/posts/${post.body.id}/publish`, ids.member, { method: "POST" })).status, 200);
  assert.equal((await call(`/api/groups/${g.id}/members/${ids.member}`, ids.owner, { method: "DELETE" })).status, 204);
  assert.equal((await call(`/api/posts/${post.body.id}`, ids.member)).status, 404);
});

test("welcome availability text is honest, controlled, and owner-only", async () => {
  const rejectedTexts = ["reply by tomorrow", "expect a response by Friday", "same-day replies", "arbitrary free text"];
  for (const text of rejectedTexts) {
    const rejected = await call("/api/groups", ids.owner, {
      method: "POST",
      body: { name: `Unsafe ${randomUUID()}`, category: "carers", welcomeAvailabilityText: text },
    });
    assert.equal(rejected.status, 400);
  }

  const approvedTexts = [
    "Welcome requests are open when a trained host is available.",
    "Trained hosts are limited; response timing is not provided.",
    "No trained active welcome host is currently available.",
  ];
  const g = await createGroup(ids.owner, { welcomeEnabled: true, welcomeAvailabilityText: null });
  assert.equal(g.welcomeAvailabilityText, "No trained active welcome host is currently available.");
  assert.equal((await call(`/api/groups/${g.id}/join`, ids.member, { method: "POST" })).status, 200);
  assert.equal((await call(`/api/groups/${g.id}/members/${ids.member}`, ids.owner, { method: "PATCH", body: { role: "moderator" } })).status, 200);
  for (const text of rejectedTexts) {
    assert.notEqual((await call(`/api/groups/${g.id}`, ids.member, { method: "PATCH", body: { welcomeAvailabilityText: text } })).status, 200);
  }
  for (const text of approvedTexts) {
    const safe = await call(`/api/groups/${g.id}`, ids.owner, { method: "PATCH", body: { welcomeAvailabilityText: text } });
    assert.equal(safe.status, 200);
    assert.equal(safe.body.welcomeAvailabilityText, text);
  }
});

test("a blocked non-owner member cannot join a group", async () => {
  const g = await createGroup(ids.owner);
  assert.equal((await call(`/api/groups/${g.id}/join`, ids.other, { method: "POST" })).status, 200);
  assert.equal((await call("/api/safety/block", ids.member, { method: "POST", body: { targetMemberId: ids.other } })).status, 201);
  assert.notEqual((await call(`/api/groups/${g.id}/join`, ids.member, { method: "POST" })).status, 200);
  const active = await db.select({ memberId: groupMembersTable.memberId }).from(groupMembersTable).where(and(
    eq(groupMembersTable.groupId, g.id),
    eq(groupMembersTable.memberId, ids.member),
    eq(groupMembersTable.status, "active"),
  ));
  assert.equal(active.length, 0);
});

test("approval cannot activate an applicant blocked by a non-owner member", async () => {
  const g = await createGroup(ids.owner, { joinPolicy: "approval" });
  const existingRequest = await call(`/api/groups/${g.id}/join`, ids.other, { method: "POST" });
  assert.equal(existingRequest.status, 202);
  assert.equal((await call(`/api/groups/${g.id}/requests/${existingRequest.body.id}/approve`, ids.owner, { method: "POST" })).status, 200);
  const request = await call(`/api/groups/${g.id}/join`, ids.member, { method: "POST" });
  assert.equal(request.status, 202);
  assert.equal((await call("/api/safety/block", ids.member, { method: "POST", body: { targetMemberId: ids.other } })).status, 201);
  assert.equal((await call(`/api/groups/${g.id}/requests/${request.body.id}/approve`, ids.owner, { method: "POST" })).status, 409);
  const active = await db.select({ memberId: groupMembersTable.memberId }).from(groupMembersTable).where(and(
    eq(groupMembersTable.groupId, g.id),
    eq(groupMembersTable.memberId, ids.member),
    eq(groupMembersTable.status, "active"),
  ));
  assert.equal(active.length, 0);
});

test("a simultaneous join and block cannot leave an active shared group", async () => {
  const g = await createGroup(ids.owner);
  assert.equal((await call(`/api/groups/${g.id}/join`, ids.other, { method: "POST" })).status, 200);
  await Promise.all([
    call(`/api/groups/${g.id}/join`, ids.member, { method: "POST" }),
    call("/api/safety/block", ids.member, { method: "POST", body: { targetMemberId: ids.other } }),
  ]);
  const active = await db.select({ memberId: groupMembersTable.memberId }).from(groupMembersTable).where(and(
    eq(groupMembersTable.groupId, g.id),
    eq(groupMembersTable.status, "active"),
    inArray(groupMembersTable.memberId, [ids.member, ids.other]),
  ));
  assert.equal(active.length, 1);
});

test("private groups are omitted from non-member results and suggestions", async () => {
  await createGroup(ids.owner, { discoverability: "private", suggestionTags: ["carer"] });
  const listed = await call("/api/groups?q=Phase", ids.other);
  assert.equal(listed.body.items.length, 0);
  const profile = await db.insert(profilesTable).values({ id: randomUUID(), memberId: ids.other, preferredName: "Other", discoverable: true, roles: ["carer"], visibility: { preferredName: "members", roles: "members" } }).returning();
  assert.ok(profile[0]);
  assert.equal((await call("/api/groups/suggestions", ids.other)).body.length, 0);
});

test("only an exact trained host can see and update a welcome queue; unavailable is honest", async () => {
  const g = await createGroup(ids.owner, { welcomeEnabled: true, welcomeAvailabilityText: "No trained active welcome host is currently available." });
  assert.equal((await call(`/api/groups/${g.id}/welcome`, ids.owner, { method: "POST", body: {} })).status, 409);
  const joined = await call(`/api/groups/${g.id}/join`, ids.member, { method: "POST" }); assert.equal(joined.status, 200);
  assert.equal((await call(`/api/groups/${g.id}/hosts`, ids.owner, { method: "POST", body: { hostMemberId: ids.member } })).status, 409);
  const [training] = await db.insert(communityHostTrainingTable).values({ id: randomUUID(), memberId: ids.member, trainedAt: new Date(Date.now() - 1000), provenance: "governance-test", auditedBy: ids.owner }).returning();
  assert.equal((await call(`/api/groups/${g.id}/hosts`, ids.owner, { method: "POST", body: { hostMemberId: ids.member } })).status, 201);
  const request = await call(`/api/groups/${g.id}/welcome`, ids.owner, { method: "POST", body: { introductionText: "Hello" } }); assert.equal(request.status, 201);
  assert.equal((await call(`/api/groups/${g.id}/welcome/me`, ids.owner)).body.status, "open");
  assert.equal((await call(`/api/groups/${g.id}/welcome`, ids.member)).body[0].requesterPreferredName, "Member");
  assert.equal((await call(`/api/groups/${g.id}/welcome`, ids.other)).status, 403);
  assert.equal((await call(`/api/groups/${g.id}/welcome/${request.body.id}/acknowledge`, ids.member, { method: "POST" })).status, 200);
  assert.equal((await call(`/api/groups/${g.id}/welcome`, ids.member)).body[0].status, "acknowledged");
  assert.equal((await call(`/api/groups/${g.id}/welcome`, ids.owner, { method: "POST", body: {} })).status, 409);
  assert.equal((await call(`/api/groups/${g.id}/welcome/${request.body.id}/close`, ids.member, { method: "POST" })).status, 200);
  assert.equal((await call(`/api/groups/${g.id}/welcome/me`, ids.owner)).body.status, "closed");
  await db.update(communityHostTrainingTable).set({ active: false, revokedAt: new Date() }).where(eq(communityHostTrainingTable.id, training.id));
  assert.equal((await call(`/api/groups/${g.id}/welcome`, ids.member)).status, 403);
});

test("leaving, muting, and closing remove active access; seeded categories contain no activity", async () => {
  const categories = await call("/api/groups/categories", ids.owner);
  assert.equal(categories.body.length, 10);
  assert.ok(categories.body.every((category: any) => category.developmentOnly === true));
  const g = await createGroup(ids.owner);
  const nonmemberView = await call(`/api/groups/${g.id}`, ids.other);
  assert.equal(nonmemberView.status, 200);
  assert.deepEqual(nonmemberView.body.members, []);
  assert.equal(nonmemberView.body.myMemberId, null);
  assert.equal(nonmemberView.body.myMuted, false);
  assert.equal((await call(`/api/groups/${g.id}/join`, ids.member, { method: "POST" })).status, 200);
  const memberView = await call(`/api/groups/${g.id}`, ids.member);
  assert.equal(memberView.body.myMemberId, ids.member);
  assert.equal(memberView.body.myMuted, false);
  const post = await call("/api/posts", ids.owner, { method: "POST", body: { body: "members-only update", audience: "this_group", groupId: g.id } });
  assert.equal(post.status, 201);
  assert.equal((await call(`/api/posts/${post.body.id}/publish`, ids.owner, { method: "POST" })).status, 200);
  assert.equal((await call(`/api/groups/${g.id}/mute`, ids.member, { method: "POST" })).status, 200);
  const mutedView = await call(`/api/groups/${g.id}`, ids.member);
  assert.equal(mutedView.body.myMemberId, ids.member);
  assert.equal(mutedView.body.myMuted, true);
  assert.equal((await call(`/api/groups/${g.id}/leave`, ids.member, { method: "POST" })).status, 200);
  assert.equal((await call(`/api/groups/${g.id}`, ids.member)).status, 200);
  const leftView = await call(`/api/groups/${g.id}`, ids.member);
  assert.deepEqual(leftView.body.members, []);
  assert.equal(leftView.body.myMemberId, null);
  assert.equal(leftView.body.myMuted, false);
  assert.equal((await call(`/api/posts/${post.body.id}`, ids.member)).status, 404);
  const privateGroup = await createGroup(ids.owner, { discoverability: "private" });
  assert.equal((await call(`/api/groups/${privateGroup.id}`, ids.member)).status, 404);
  assert.equal((await call(`/api/groups/${g.id}`, ids.owner, { method: "DELETE" })).status, 204);
  assert.equal((await call(`/api/groups/${g.id}`, ids.owner)).status, 404);
  assert.equal((await db.select().from(groupMembersTable).where(and(eq(groupMembersTable.groupId, g.id), eq(groupMembersTable.status, "active")))).length, 0);
  assert.equal((await db.select().from(groupMembershipRequestsTable).where(and(eq(groupMembershipRequestsTable.groupId, g.id), eq(groupMembershipRequestsTable.status, "pending")))).length, 0);
  assert.equal((await db.select().from(groupWelcomeRequestsTable).where(and(eq(groupWelcomeRequestsTable.groupId, g.id), eq(groupWelcomeRequestsTable.status, "open")))).length, 0);
  assert.equal((await call(`/api/posts/${post.body.id}`, ids.owner)).status, 404);
  assert.equal((await db.select().from(postsTable).where(and(eq(postsTable.groupId, g.id), eq(postsTable.status, "published")))).length, 1);
});

test("moderator authority is group-scoped and cannot target owners or peer moderators", async () => {
  const groupA = await createGroup(ids.owner);
  assert.equal((await call(`/api/groups/${groupA.id}/join`, ids.member, { method: "POST" })).status, 200);
  assert.equal((await call(`/api/groups/${groupA.id}/join`, ids.other, { method: "POST" })).status, 200);
  assert.equal((await call(`/api/groups/${groupA.id}/members/${ids.member}`, ids.owner, { method: "PATCH", body: { role: "moderator" } })).status, 200);
  assert.equal((await call(`/api/groups/${groupA.id}/members/${ids.other}`, ids.owner, { method: "PATCH", body: { role: "moderator" } })).status, 200);

  const groupB = await createGroup(ids.owner, { joinPolicy: "approval" });
  assert.equal((await call(`/api/groups/${groupB.id}/join`, ids.member, { method: "POST" })).status, 202);
  const requestB = await call(`/api/groups/${groupB.id}/join`, ids.other, { method: "POST" });
  assert.equal(requestB.status, 202);
  assert.notEqual((await call(`/api/groups/${groupB.id}/requests/${requestB.body.id}/approve`, ids.member, { method: "POST" })).status, 200);
  assert.notEqual((await call(`/api/groups/${groupB.id}/resources`, ids.member, { method: "POST", body: { url: "https://example.com/r", title: "Resource" } })).status, 201);
  assert.notEqual((await call(`/api/groups/${groupB.id}/hosts`, ids.member, { method: "POST", body: { hostMemberId: ids.member } })).status, 201);
  assert.notEqual((await call(`/api/groups/${groupB.id}/members/${ids.owner}`, ids.member, { method: "DELETE" })).status, 204);
  assert.equal((await call(`/api/groups/${groupB.id}/requests/${requestB.body.id}/approve`, ids.owner, { method: "POST" })).status, 200);
  assert.notEqual((await call(`/api/groups/${groupA.id}/members/${ids.other}`, ids.member, { method: "DELETE" })).status, 204);
  assert.notEqual((await call(`/api/groups/${groupA.id}/members/${ids.owner}`, ids.member, { method: "DELETE" })).status, 204);

  assert.equal((await call(`/api/groups/${groupA.id}/resources`, ids.owner, { method: "POST", body: { url: "https://example.com/r", title: "Resource" } })).status, 201);
  assert.equal((await call(`/api/groups/${groupA.id}/hosts`, ids.owner, { method: "POST", body: { hostMemberId: ids.member } })).status, 409);
  await db.insert(communityHostTrainingTable).values({ id: randomUUID(), memberId: ids.member, trainedAt: new Date(Date.now() - 1000), active: true, provenance: "phase9-test-governance" });
  assert.equal((await call(`/api/groups/${groupA.id}/hosts`, ids.owner, { method: "POST", body: { hostMemberId: ids.member } })).status, 201);
  assert.equal((await call(`/api/groups/${groupA.id}/members/${ids.other}`, ids.owner, { method: "DELETE" })).status, 204);
});

test("export omits inaccessible group content and metadata after removal or closure", async () => {
  const g = await createGroup(ids.owner, { contentVisibility: "members" });
  assert.equal((await call(`/api/groups/${g.id}/join`, ids.member, { method: "POST" })).status, 200);
  const post = await call("/api/posts", ids.member, { method: "POST", body: { body: "private group export body", audience: "this_group", groupId: g.id } });
  assert.equal(post.status, 201);
  assert.equal((await call(`/api/posts/${post.body.id}/publish`, ids.member, { method: "POST" })).status, 200);
  assert.equal((await call(`/api/groups/${g.id}/members/${ids.member}`, ids.owner, { method: "DELETE" })).status, 204);
  const removedExport = await call("/api/profile/export", ids.member);
  assert.equal(removedExport.status, 200);
  assert.equal(removedExport.body.posts.some((row: any) => row.id === post.body.id), false);
  assert.equal(removedExport.body.groups.some((row: any) => row.id === g.id), false);
  assert.ok(removedExport.body.groupMemberships.some((row: any) => row.groupId === g.id && row.status === "removed"));

  const closed = await createGroup(ids.owner, { contentVisibility: "members" });
  const ownerPost = await call("/api/posts", ids.owner, { method: "POST", body: { body: "closed export body", audience: "this_group", groupId: closed.id } });
  assert.equal(ownerPost.status, 201);
  assert.equal((await call(`/api/posts/${ownerPost.body.id}/publish`, ids.owner, { method: "POST" })).status, 200);
  assert.equal((await call(`/api/groups/${closed.id}`, ids.owner, { method: "DELETE" })).status, 204);
  const closedExport = await call("/api/profile/export", ids.owner);
  assert.equal(closedExport.body.posts.some((row: any) => row.id === ownerPost.body.id), false);
  assert.equal(closedExport.body.groups.some((row: any) => row.id === closed.id), false);
});