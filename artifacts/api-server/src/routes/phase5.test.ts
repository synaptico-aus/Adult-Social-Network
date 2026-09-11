import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, pool, membersTable, profilesTable, friendRequestsTable, friendshipsTable, followsTable, discoverySettingsTable, suggestionHidesTable, safetyRelationshipsTable } from "@workspace/db";
import { createApp } from "../app.ts";
import { canViewMemberContent } from "../lib/content-audience.ts";

const ids = Object.fromEntries(["a", "b", "c", "d"].map((key) => [key, `phase5-${key}-${randomUUID()}`])) as Record<string, string>;
const app = createApp({ authMiddleware: (req, _res, next) => {
  const userId = req.header("x-test-user") ?? null;
  const auth = Object.assign(() => ({ userId, tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true });
  Object.assign(req, { auth }); next();
} });
let server: ReturnType<typeof app.listen>; let base = "";
async function call(path: string, user: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${base}${path}`, { method: options.method ?? "GET", headers: { "x-test-user": user, ...(options.body === undefined ? {} : { "content-type": "application/json" }) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  return { status: response.status, body: await response.json().catch(() => undefined) as any };
}
before(async () => {
  server = app.listen(0); await new Promise<void>((resolve) => server.once("listening", resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await db.insert(membersTable).values(Object.values(ids).map((id) => ({ id, clerkUserId: id, emailVerified: true })));
  await db.insert(profilesTable).values(Object.values(ids).map((id, i) => ({ id: `profile-${id}`, memberId: id, preferredName: `Phase ${i}`, discoverable: true, language: "en", broadRegion: "north", interests: ["walking", "music"], visibility: { preferredName: "members", language: "members", broadRegion: "members", interests: "members", biography: "private", photoPath: "private", dementiaConnection: "private", roles: "private" } as const })));
});
after(async () => {
  await db.delete(safetyRelationshipsTable).where(or(inArray(safetyRelationshipsTable.actorMemberId, Object.values(ids)), inArray(safetyRelationshipsTable.targetMemberId, Object.values(ids))));
  await db.delete(suggestionHidesTable).where(or(inArray(suggestionHidesTable.memberId, Object.values(ids)), inArray(suggestionHidesTable.suggestedMemberId, Object.values(ids))));
  await db.delete(friendRequestsTable).where(or(inArray(friendRequestsTable.requesterMemberId, Object.values(ids)), inArray(friendRequestsTable.recipientMemberId, Object.values(ids))));
  await db.delete(friendshipsTable).where(or(inArray(friendshipsTable.memberAId, Object.values(ids)), inArray(friendshipsTable.memberBId, Object.values(ids))));
  await db.delete(followsTable).where(or(inArray(followsTable.followerMemberId, Object.values(ids)), inArray(followsTable.followedMemberId, Object.values(ids))));
  await db.delete(discoverySettingsTable).where(inArray(discoverySettingsTable.memberId, Object.values(ids)));
  await db.delete(membersTable).where(inArray(membersTable.id, Object.values(ids)));
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("friend requests are account scoped and duplicate/crossed behavior is deterministic", async () => {
  const first = await call("/api/friends/requests", ids.a, { method: "POST", body: { targetMemberId: ids.b } });
  assert.equal(first.status, 201); assert.equal(first.body.status, "created");
  const duplicate = await call("/api/friends/requests", ids.a, { method: "POST", body: { targetMemberId: ids.b } });
  assert.equal(duplicate.status, 409);
  const reciprocal = await call("/api/friends/requests", ids.b, { method: "POST", body: { targetMemberId: ids.a } });
  assert.equal(reciprocal.status, 200); assert.equal(reciprocal.body.status, "incoming_request");
  const listed = await call("/api/friends/requests", ids.b);
  assert.equal(listed.body.incoming.length, 1); assert.equal(listed.body.outgoing.length, 0);
});

test("simultaneous crossed requests produce one pending request and one reciprocal response", async () => {
  const [left, right] = await Promise.all([
    call("/api/friends/requests", ids.c, { method: "POST", body: { targetMemberId: ids.d } }),
    call("/api/friends/requests", ids.d, { method: "POST", body: { targetMemberId: ids.c } }),
  ]);
  assert.deepEqual(new Set([left.status, right.status]), new Set([200, 201]));
  const requests = await db.select().from(friendRequestsTable).where(and(eq(friendRequestsTable.memberAId, ids.c < ids.d ? ids.c : ids.d), eq(friendRequestsTable.memberBId, ids.c < ids.d ? ids.d : ids.c)));
  assert.equal(requests.length, 1);
});

test("accept, decline, cancel are recipient/requester authorized", async () => {
  const request = await call("/api/friends/requests", ids.a, { method: "POST", body: { targetMemberId: ids.d } });
  const id = request.body.request.id;
  assert.equal((await call(`/api/friends/requests/${id}/accept`, ids.d, { method: "POST" })).status, 200);
  assert.equal((await call(`/api/friends/requests/${id}/accept`, ids.d, { method: "POST" })).status, 404);
  const decline = await call("/api/friends/requests", ids.b, { method: "POST", body: { targetMemberId: ids.d } });
  assert.equal((await call(`/api/friends/requests/${decline.body.request.id}/decline`, ids.d, { method: "POST" })).status, 204);
  const cancel = await call("/api/friends/requests", ids.b, { method: "POST", body: { targetMemberId: ids.c } });
  assert.equal((await call(`/api/friends/requests/${cancel.body.request.id}`, ids.c, { method: "DELETE" })).status, 404);
  assert.equal((await call(`/api/friends/requests/${cancel.body.request.id}`, ids.b, { method: "DELETE" })).status, 204);
  assert.equal((await call(`/api/friends/requests/${id}`, ids.a, { method: "DELETE" })).status, 404);
});

test("friendship removal and follows do not grant friends audience", async () => {
  const req = await call("/api/friends/requests", ids.a, { method: "POST", body: { targetMemberId: ids.c } });
  assert.equal((await call(`/api/friends/requests/${req.body.request.id}/accept`, ids.c, { method: "POST" })).status, 200);
  const friends = await call("/api/friends", ids.a); assert.equal(friends.body.items.some((item: { memberId: string }) => item.memberId === ids.c), true);
  assert.equal((await call(`/api/friends/${ids.c}`, ids.a, { method: "DELETE" })).status, 204);
  assert.equal((await call(`/api/follows/${ids.c}`, ids.a, { method: "POST" })).status, 201);
  const list = await call("/api/friends", ids.a); assert.equal(list.body.items.some((item: { memberId: string }) => item.memberId === ids.c), false);
});

test("blocking removes both-direction relationships and excludes discovery", async () => {
  await db.insert(followsTable).values([{ id: randomUUID(), followerMemberId: ids.a, followedMemberId: ids.b }, { id: randomUUID(), followerMemberId: ids.b, followedMemberId: ids.a }]);
  await call("/api/safety/block", ids.a, { method: "POST", body: { targetMemberId: ids.b } });
  assert.equal((await db.select().from(followsTable).where(or(and(eq(followsTable.followerMemberId, ids.a), eq(followsTable.followedMemberId, ids.b)), and(eq(followsTable.followerMemberId, ids.b), eq(followsTable.followedMemberId, ids.a))))).length, 0);
  assert.equal((await call("/api/search?q=Phase", ids.a)).body.items.some((item: any) => item.profile.memberId === ids.b), false);
});

test("repeated block remains idempotent and leaves pair clean", async () => {
  await Promise.all([
    call("/api/safety/block", ids.a, { method: "POST", body: { targetMemberId: ids.b } }),
    call("/api/safety/block", ids.b, { method: "POST", body: { targetMemberId: ids.a } }),
  ]);
  await call("/api/safety/block", ids.a, { method: "POST", body: { targetMemberId: ids.b } });
  const requests = await db.select().from(friendRequestsTable).where(or(and(eq(friendRequestsTable.memberAId, ids.a), eq(friendRequestsTable.memberBId, ids.b)), and(eq(friendRequestsTable.memberAId, ids.b), eq(friendRequestsTable.memberBId, ids.a))));
  const friendships = await db.select().from(friendshipsTable).where(or(and(eq(friendshipsTable.memberAId, ids.a), eq(friendshipsTable.memberBId, ids.b)), and(eq(friendshipsTable.memberAId, ids.b), eq(friendshipsTable.memberBId, ids.a))));
  const follows = await db.select().from(followsTable).where(or(and(eq(followsTable.followerMemberId, ids.a), eq(followsTable.followedMemberId, ids.b)), and(eq(followsTable.followerMemberId, ids.b), eq(followsTable.followedMemberId, ids.a))));
  assert.equal(requests.length + friendships.length + follows.length, 0);
});

test("real DB content audience helper tracks friendship, follow, unfriend, and bilateral block", async () => {
  await db.delete(safetyRelationshipsTable).where(or(and(eq(safetyRelationshipsTable.actorMemberId, ids.a), eq(safetyRelationshipsTable.targetMemberId, ids.c)), and(eq(safetyRelationshipsTable.actorMemberId, ids.c), eq(safetyRelationshipsTable.targetMemberId, ids.a))));
  await db.delete(friendshipsTable).where(and(eq(friendshipsTable.memberAId, ids.a < ids.c ? ids.a : ids.c), eq(friendshipsTable.memberBId, ids.a < ids.c ? ids.c : ids.a)));
  await db.delete(followsTable).where(or(and(eq(followsTable.followerMemberId, ids.a), eq(followsTable.followedMemberId, ids.c)), and(eq(followsTable.followerMemberId, ids.c), eq(followsTable.followedMemberId, ids.a))));
  assert.equal(await canViewMemberContent(db, ids.a, ids.c, "friends"), false);
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId: ids.a < ids.c ? ids.a : ids.c, memberBId: ids.a < ids.c ? ids.c : ids.a });
  assert.equal(await canViewMemberContent(db, ids.a, ids.c, "friends"), true);
  await db.delete(friendshipsTable).where(and(eq(friendshipsTable.memberAId, ids.a < ids.c ? ids.a : ids.c), eq(friendshipsTable.memberBId, ids.a < ids.c ? ids.c : ids.a)));
  await db.insert(followsTable).values({ id: randomUUID(), followerMemberId: ids.c, followedMemberId: ids.a });
  assert.equal(await canViewMemberContent(db, ids.a, ids.c, "friends"), false);
  await db.delete(followsTable).where(and(eq(followsTable.followerMemberId, ids.c), eq(followsTable.followedMemberId, ids.a)));
  await db.insert(safetyRelationshipsTable).values({ id: randomUUID(), actorMemberId: ids.c, targetMemberId: ids.a, kind: "block" });
  assert.equal(await canViewMemberContent(db, ids.a, ids.c, "friends"), false);
});

test("friend request list supplies a non-null safe fallback for profile-less members", async () => {
  const profileless = `phase5-profileless-${randomUUID()}`;
  await db.insert(membersTable).values({ id: profileless, clerkUserId: profileless, emailVerified: true });
  const created = await call("/api/friends/requests", profileless, { method: "POST", body: { targetMemberId: ids.a } });
  const listed = await call("/api/friends/requests", ids.a);
  const found = listed.body.incoming.find((row: { id: string }) => row.id === created.body.request.id);
  assert.deepEqual(found.profile, { memberId: profileless, preferredName: "Member" });
  await db.delete(membersTable).where(eq(membersTable.id, profileless));
});

test("block versus accept and follow races converge to a blocked clean pair", async () => {
  const request = await call("/api/friends/requests", ids.b, { method: "POST", body: { targetMemberId: ids.c } });
  await Promise.all([
    call(`/api/friends/requests/${request.body.request.id}/accept`, ids.c, { method: "POST" }),
    call("/api/safety/block", ids.b, { method: "POST", body: { targetMemberId: ids.c } }),
  ]);
  await Promise.all([
    call(`/api/follows/${ids.d}`, ids.b, { method: "POST" }),
    call("/api/safety/block", ids.b, { method: "POST", body: { targetMemberId: ids.d } }),
  ]);
  await Promise.all([
    call("/api/safety/block", ids.c, { method: "POST", body: { targetMemberId: ids.b } }),
    call("/api/safety/block", ids.b, { method: "POST", body: { targetMemberId: ids.c } }),
  ]);
  for (const [left, right] of [[ids.b, ids.c], [ids.b, ids.d]] as const) {
    const blocked = await db.select().from(safetyRelationshipsTable).where(and(eq(safetyRelationshipsTable.kind, "block"), or(and(eq(safetyRelationshipsTable.actorMemberId, left), eq(safetyRelationshipsTable.targetMemberId, right)), and(eq(safetyRelationshipsTable.actorMemberId, right), eq(safetyRelationshipsTable.targetMemberId, left)))));
    assert.ok(blocked.length > 0);
    const [a, b] = left < right ? [left, right] : [right, left];
    assert.equal((await db.select().from(friendRequestsTable).where(and(eq(friendRequestsTable.memberAId, a), eq(friendRequestsTable.memberBId, b)))).length, 0);
    assert.equal((await db.select().from(friendshipsTable).where(and(eq(friendshipsTable.memberAId, a), eq(friendshipsTable.memberBId, b)))).length, 0);
    assert.equal((await db.select().from(followsTable).where(or(and(eq(followsTable.followerMemberId, left), eq(followsTable.followedMemberId, right)), and(eq(followsTable.followerMemberId, right), eq(followsTable.followedMemberId, left))))).length, 0);
  }
});

test("discoverability, settings, suggestions privacy, and stable pagination", async () => {
  await db.update(profilesTable).set({ discoverable: false }).where(eq(profilesTable.memberId, ids.d));
  assert.equal((await call("/api/search?q=Phase", ids.a)).body.items.some((item: any) => item.profile.memberId === ids.d), false);
  await call("/api/account/settings", ids.a, { method: "PATCH", body: { suggestionsEnabled: true } });
  const suggestions = await call("/api/discovery/suggestions", ids.a); assert.ok(Array.isArray(suggestions.body));
  await db.update(profilesTable).set({ visibility: { preferredName: "members", language: "private", broadRegion: "private", interests: "private" } }).where(eq(profilesTable.memberId, ids.c));
  const privateSuggestions = await call("/api/discovery/suggestions", ids.a);
  assert.equal(privateSuggestions.body.some((item: { memberId: string }) => item.memberId === ids.c), false);
  const page = await call("/api/search?q=Phase&limit=1", ids.a); if (page.body.nextCursor) { const next = await call(`/api/search?q=Phase&limit=1&cursor=${encodeURIComponent(page.body.nextCursor)}`, ids.a); assert.notEqual(next.body.items[0]?.profile.memberId, page.body.items[0]?.profile.memberId); }
});

test("member-keyed mutation limiter returns 429", async () => {
  let status = 0;
  for (let i = 0; i < 35; i++) status = (await call(`/api/follows/${ids.d}`, ids.c, { method: "POST" })).status;
  assert.equal(status, 429);
});