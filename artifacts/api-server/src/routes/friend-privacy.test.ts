import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, pool, membersTable, profilesTable, postsTable, friendshipsTable,
  moderationRecordsTable, notificationEventsTable, mediaAssetsTable, consentHistoryTable, friendRequestsTable, safetyRelationshipsTable } from "@workspace/db";
import { createApp } from "../app";
import { canReadMedia } from "../lib/media-authority";
import { visibleProfile, defaultVisibility } from "../lib/profile-policy";
import { intersectPermissions, allPermissions, lockPrivacyUpdate } from "../lib/friend-permissions";
import { purgeFriendPrivacyReferences } from "../lib/friend-privacy-cleanup";

// Isolated, labelled synthetic identities; never real member sessions or consent.
const alice = `privacy-test-alice-${randomUUID()}`;
const bob = `privacy-test-bob-${randomUUID()}`;
const carol = `privacy-test-carol-${randomUUID()}`;
const people = [alice, bob, carol];
const app = createApp({ authMiddleware: (req, _res, next) => {
  const auth = Object.assign(() => ({ userId: req.header("x-test-user") ?? null, tokenType: "session_token" }),
    { [Symbol.for("@clerk/express.auth")]: true });
  Object.assign(req, { auth }); next();
} });
let server: ReturnType<typeof app.listen>;
let base: string;
async function call(path: string, user: string, method = "GET", body?: unknown) {
  const response = await fetch(`${base}/api${path}`, { method,
    headers: { "x-test-user": user, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => undefined) as any };
}
async function makePost(user: string, input: Record<string, unknown> = {}) {
  const draft = await call("/posts", user, "POST", { body: "Clearly labelled privacy test", audience: "public", ...input });
  assert.equal(draft.status, 201);
  assert.equal((await call(`/posts/${draft.body.id}/publish`, user, "POST")).status, 200);
  // Fixture publication isolates privacy enforcement from external screening.
  await db.update(moderationRecordsTable).set({ state: "allowed" })
    .where(eq(moderationRecordsTable.contentId, draft.body.id));
  return draft.body.id as string;
}
async function defaults(permissions: typeof allPermissions) {
  const expectedFriendPermissions = (await call("/profile", alice)).body.friendPermissions;
  assert.equal((await call("/privacy", alice, "PATCH", { friendPermissions: { [bob]: permissions }, expectedFriendPermissions })).status, 200);
}
async function connect() {
  const [a, b] = [alice, bob].sort();
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId: a, memberBId: b });
}
before(async () => {
  await db.insert(membersTable).values(people.map((id) => ({ id, clerkUserId: id, emailVerified: true })));
  await db.insert(profilesTable).values({ id: randomUUID(), memberId: alice, preferredName: "Privacy test Alice", discoverable: true });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(async () => {
  await db.delete(safetyRelationshipsTable).where(inArray(safetyRelationshipsTable.actorMemberId, people));
  await db.delete(notificationEventsTable).where(or(inArray(notificationEventsTable.actorMemberId, people), inArray(notificationEventsTable.recipientMemberId, people)));
  await db.delete(moderationRecordsTable).where(inArray(moderationRecordsTable.subjectMemberId, people));
  await db.delete(postsTable).where(inArray(postsTable.authorMemberId, people));
  await db.delete(friendshipsTable).where(inArray(friendshipsTable.memberAId, people));
  await db.delete(friendRequestsTable).where(or(inArray(friendRequestsTable.requesterMemberId, people), inArray(friendRequestsTable.recipientMemberId, people)));
  await db.update(profilesTable).set({ friendPermissions: {}, selectedFriends: {}, visibility: defaultVisibility() }).where(eq(profilesTable.memberId, alice));
});
after(async () => {
  try {
  await db.delete(safetyRelationshipsTable).where(inArray(safetyRelationshipsTable.actorMemberId, people));
  await db.delete(notificationEventsTable).where(or(inArray(notificationEventsTable.actorMemberId, people), inArray(notificationEventsTable.recipientMemberId, people)));
  await db.delete(moderationRecordsTable).where(inArray(moderationRecordsTable.subjectMemberId, people));
  await db.delete(friendshipsTable).where(or(inArray(friendshipsTable.memberAId, people), inArray(friendshipsTable.memberBId, people)));
  await db.delete(consentHistoryTable).where(inArray(consentHistoryTable.memberId, people));
  await db.delete(membersTable).where(inArray(membersTable.id, people));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
});

test("defaults deny each interaction; a post cannot override a default denial", async () => {
  await connect();
  await defaults({ view: true, react: false, comment: false, share: false });
  const id = await makePost(alice, { friendRestrictions: { [bob]: allPermissions } });
  const viewed = await call(`/posts/${id}`, bob);
  assert.equal(viewed.status, 200);
  assert.deepEqual(viewed.body.permissions, { view: true, react: false, comment: false, share: false });
  assert.equal(viewed.body.friendRestrictions, undefined, "never disclose owner friend selections");
  assert.equal((await call(`/posts/${id}/reactions`, bob, "POST", { kind: "hear_you" })).status, 404);
  assert.equal((await call(`/posts/${id}/comments`, bob, "POST", { body: "not permitted" })).status, 404);
  assert.equal((await call("/posts", bob, "POST", { body: "share", audience: "public", originalPostId: id })).status, 404);
  assert.equal((await call(`/posts/${id}`, carol)).body.permissions.react, true);
  assert.equal((await call(`/posts/${id}`, alice)).body.friendRestrictions[bob].view, true);
  assert.deepEqual((await call("/profile", alice)).body.friendPermissions[bob], { view: true, react: false, comment: false, share: false });
});

test("per-post restrictions persist on drafts/edits, never widen audiences, and revoke media", async () => {
  await connect();
  const assetId = `privacy-media-${randomUUID()}`;
  const [asset] = await db.insert(mediaAssetsTable).values({ id: assetId, ownerMemberId: alice, kind: "photo",
    objectPath: `/privacy-test/${assetId}`, clientIdempotencyKey: assetId, requestedContentType: "image/jpeg",
    status: "ready", malwareState: "allowed", abuseState: "allowed", expiresAt: new Date(Date.now() + 86400000) }).returning();
  const id = await makePost(alice, { audience: "friends", mediaAssetIds: [assetId] });
  assert.equal(await canReadMedia(asset, bob), true);
  assert.equal((await call(`/posts/${id}`, carol)).status, 404);
  const denied = { view: false, react: true, comment: true, share: true };
  assert.equal((await call(`/posts/${id}`, alice, "PATCH", { friendRestrictions: { [bob]: denied } })).status, 200);
  assert.equal((await call(`/posts/${id}`, alice)).body.friendRestrictions[bob].view, false);
  assert.equal((await call(`/posts/${id}`, bob)).status, 404);
  assert.equal(await canReadMedia(asset, bob), false, "originals and derivatives use the same media authority");
  const feed = await call("/feed", bob);
  assert.ok(!feed.body.items.some((p: { id: string }) => p.id === id));
  await defaults({ ...allPermissions, view: false });
  assert.equal((await call(`/posts/${id}`, alice, "PATCH", { friendRestrictions: { [bob]: allPermissions } })).status, 200);
  assert.equal((await call(`/posts/${id}`, bob)).status, 404, "a post grant cannot widen the default");
});

test("changing share permission invalidates existing reshares and private deep links require authentication", async () => {
  await connect();
  const original = await makePost(alice);
  const shared = await makePost(bob, { originalPostId: original });
  assert.equal((await call(`/posts/${shared}`, carol)).status, 200);
  await defaults({ ...allPermissions, share: false });
  assert.equal((await call(`/posts/${shared}`, carol)).status, 404);
  assert.equal((await call(`/posts/${original}`, carol)).status, 200);
  assert.equal((await call(`/posts/${original}`, "")).status, 401);
});

test("selected profile fields need live friendship and do not expose selection lists", async () => {
  await connect();
  assert.equal((await call("/privacy", alice, "PATCH", {
    visibility: { ...defaultVisibility(), biography: "connections" },
    selectedFriends: { biography: [bob] },
  })).status, 200);
  const [profile] = await db.update(profilesTable).set({ biography: "Test-only profile text" }).where(eq(profilesTable.memberId, alice)).returning();
  assert.equal(visibleProfile(profile, "connection", bob).biography, "Test-only profile text");
  assert.equal(visibleProfile(profile, "connection", carol).biography, undefined);
  assert.equal(visibleProfile(profile, "member", bob).biography, undefined, "removed friendship is not an access grant");
  assert.equal(visibleProfile(profile, "connection", bob).selectedFriends, undefined);
  const connected = await call("/search?q=Privacy", bob);
  assert.equal(connected.body.items.find((p: any) => p.memberId === alice).profile.biography, "Test-only profile text");
  await db.delete(friendshipsTable).where(or(eq(friendshipsTable.memberAId, alice), eq(friendshipsTable.memberBId, alice)));
  const removed = await call("/search?q=Privacy", bob);
  assert.equal(removed.body.items.find((p: any) => p.memberId === alice).profile.biography, undefined);
  assert.equal((await call("/privacy", alice, "PATCH", { selectedFriends: { password: [bob] } })).status, 400);
  assert.equal(intersectPermissions({ ...allPermissions, view: false }, allPermissions).share, false);
  assert.equal(intersectPermissions(allPermissions, allPermissions, false).comment, false);
});

test("account deletion purges references without opening an empty selected audience", async () => {
  await connect();
  await defaults({ ...allPermissions, view: false });
  await call("/privacy", alice, "PATCH", { selectedFriends: { biography: [bob], interests: [carol], roles: null } });
  const id = await makePost(alice, { friendRestrictions: { [bob]: allPermissions, [carol]: allPermissions } });
  await purgeFriendPrivacyReferences(bob);
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.memberId, alice));
  assert.equal(profile.friendPermissions[bob], undefined);
  assert.deepEqual(profile.selectedFriends.biography, [], "empty selection must stay closed");
  assert.deepEqual(profile.selectedFriends.interests, [carol]);
  assert.equal(profile.selectedFriends.roles, null);
  const saved = (await call(`/posts/${id}`, alice)).body;
  assert.equal(saved.friendRestrictions[bob], undefined);
  assert.deepEqual(saved.friendRestrictions[carol], allPermissions);
});

test("in-flight reactions wait for privacy revocation and recheck the committed defaults", async () => {
  const id = await makePost(alice);
  let action: ReturnType<typeof call> | undefined;
  await db.transaction(async (tx) => {
    await lockPrivacyUpdate(tx, alice);
    action = call(`/posts/${id}/reactions`, bob, "POST", { kind: "hear_you" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await tx.update(profilesTable).set({ friendPermissions: { [bob]: { ...allPermissions, react: false } } }).where(eq(profilesTable.memberId, alice));
  });
  assert.equal((await action!).status, 404);
  assert.deepEqual((await call(`/posts/${id}`, bob)).body.myReactions, []);
});

async function incomingRequest() {
  const [a, b] = [alice, bob].sort();
  const id = randomUUID();
  await db.insert(friendRequestsTable).values({
    id, requesterMemberId: bob, recipientMemberId: alice, memberAId: a, memberBId: b,
  });
  return id;
}
async function stillPending(id: string) {
  assert.equal((await db.select().from(friendRequestsTable).where(eq(friendRequestsTable.id, id))).length, 1);
  assert.equal((await db.select().from(friendshipsTable).where(and(
    eq(friendshipsTable.memberAId, [alice, bob].sort()[0]),
    eq(friendshipsTable.memberBId, [alice, bob].sort()[1]),
  ))).length, 0);
}

test("friend preview is owner-scoped and matches live profile, audiences and effective actions", async () => {
  await connect();
  await db.update(profilesTable).set({ biography: "Owner biography", interests: ["Test interest"] }).where(eq(profilesTable.memberId, alice));
  await call("/privacy", alice, "PATCH", {
    visibility: { ...defaultVisibility(), biography: "connections", interests: "members" },
    selectedFriends: { biography: [bob], interests: [carol] },
  });
  const shown = await makePost(alice, { audience: "friends", commentsOpen: false });
  const privatePost = await makePost(alice, { audience: "only_me" });
  const restricted = await makePost(alice, { friendRestrictions: { [bob]: { ...allPermissions, react: false } } });
  const draft = await call("/posts", alice, "POST", { body: "Owner draft", audience: "friends" });
  await makePost(bob, { body: "Friend content must never be returned" });
  await defaults({ ...allPermissions, share: false });
  const preview = await call(`/profile/view-as-friend/${bob}`, alice);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.friendId, bob);
  assert.equal(preview.body.fields.find((f: any) => f.field === "biography").value, "Owner biography");
  assert.deepEqual(preview.body.fields.find((f: any) => f.field === "interests"), { field: "interests", visible: false, value: null });
  const post = preview.body.posts.find((p: any) => p.id === shown);
  assert.equal(post.visible, true);
  assert.deepEqual(post.permissions, (await call(`/posts/${shown}`, bob)).body.permissions);
  assert.deepEqual(post.permissions, { view: true, react: true, comment: false, share: false });
  assert.equal(preview.body.posts.find((p: any) => p.id === restricted).permissions.react, false);
  for (const id of [privatePost, draft.body.id]) {
    const hidden = preview.body.posts.find((p: any) => p.id === id);
    assert.equal(hidden.visible, false);
    assert.deepEqual(hidden.permissions, { view: false, react: false, comment: false, share: false });
  }
  assert.equal(preview.body.posts.length, 4, "only signed-in owner's posts are enumerated");
  assert.equal((await call(`/profile/view-as-friend/${bob}`, "")).status, 401);
  assert.equal((await call(`/profile/view-as-friend/${alice}`, alice)).status, 404);
  assert.equal((await call(`/profile/view-as-friend/${carol}`, alice)).status, 404);
  assert.equal((await call(`/profile/view-as-friend/${bob}?ownerId=${carol}`, alice)).status, 400);
  assert.equal((await call(`/profile/view-as-friend/${bob}?offset=-1`, alice)).status, 400);
  assert.equal((await call(`/profile/view-as-friend/${bob}?offset=20`, alice)).body.posts.length, 0);
});

test("preview rechecks changed defaults, removed connections and blocks in either direction", async () => {
  await connect();
  const id = await makePost(alice);
  assert.equal((await call(`/profile/view-as-friend/${bob}`, alice)).body.posts[0].visible, true);
  await defaults({ ...allPermissions, view: false });
  let preview = await call(`/profile/view-as-friend/${bob}`, alice);
  assert.equal(preview.body.posts.find((p: any) => p.id === id).visible, false);
  assert.ok(preview.body.fields.every((f: any) => !f.visible));
  await defaults(allPermissions);
  preview = await call(`/profile/view-as-friend/${bob}`, alice);
  assert.equal(preview.body.posts[0].visible, true);
  await db.delete(friendshipsTable).where(inArray(friendshipsTable.memberAId, people));
  assert.equal((await call(`/profile/view-as-friend/${bob}`, alice)).status, 404);
  await connect();
  for (const [actorMemberId, targetMemberId] of [[alice, bob], [bob, alice]]) {
    const blockId = randomUUID();
    await db.insert(safetyRelationshipsTable).values({ id: blockId, actorMemberId, targetMemberId, kind: "block" });
    assert.equal((await call(`/profile/view-as-friend/${bob}`, alice)).status, 404);
    await db.delete(safetyRelationshipsTable).where(eq(safetyRelationshipsTable.id, blockId));
  }
  assert.equal((await call(`/profile/view-as-friend/${bob}`, alice)).status, 200);
});

test("preview pages cover all owned posts without exposing friend's bodies or media URLs", async () => {
  await connect();
  await db.insert(postsTable).values(Array.from({ length: 23 }, (_, i) => ({
    id: randomUUID(), authorMemberId: alice, body: `Preview pagination ${i}`, audience: "friends" as const,
    status: "draft" as const,
  })));
  const first = await call(`/profile/view-as-friend/${bob}`, alice);
  assert.equal(first.body.posts.length, 20);
  assert.equal(first.body.nextOffset, 20);
  const second = await call(`/profile/view-as-friend/${bob}?offset=${first.body.nextOffset}`, alice);
  assert.equal(second.body.posts.length, 3);
  assert.equal(second.body.nextOffset, null);
  assert.equal(new Set([...first.body.posts, ...second.body.posts].map((p: any) => p.id)).size, 23);
  assert.ok(first.body.posts.every((p: any) => !("mediaAssets" in p) && !("originalPost" in p)));
});
const restricted = { view: true, react: false, comment: false, share: false };

test("acceptance atomically saves reviewed caps, preserves other friends and applies to older posts", async () => {
  const older = await makePost(alice, { audience: "friends", friendRestrictions: { [bob]: allPermissions } });
  assert.equal((await call(`/posts/${older}`, bob)).status, 404);
  await call("/privacy", alice, "PATCH", { friendPermissions: { [carol]: { ...allPermissions, view: false } }, expectedFriendPermissions: {} });
  const id = await incomingRequest();
  assert.equal((await call(`/friends/requests/${id}/accept`, alice, "POST", {
    permissions: restricted, expectedPermissions: allPermissions,
  })).status, 200);
  const viewed = await call(`/posts/${older}`, bob);
  assert.equal(viewed.status, 200);
  assert.deepEqual(viewed.body.permissions, restricted, "older per-post grants cannot override the saved cap");
  const saved = (await call("/profile", alice)).body.friendPermissions;
  assert.deepEqual(saved[bob], restricted);
  assert.equal(saved[carol].view, false);
  assert.equal((await call(`/posts/${older}/reactions`, bob, "POST", { kind: "hear_you" })).status, 404);
});

test("acceptance with View off never exposes older friends posts; omitted review preserves defaults", async () => {
  const older = await makePost(alice, { audience: "friends" });
  await defaults({ ...allPermissions, view: false });
  const id = await incomingRequest();
  assert.equal((await call(`/friends/requests/${id}/accept`, alice, "POST")).status, 200);
  assert.equal((await call(`/posts/${older}`, bob)).status, 404);
  assert.equal((await call("/profile", alice)).body.friendPermissions[bob].view, false);
});

test("bad, unauthorized and stale acceptance choices leave the request pending", async () => {
  const id = await incomingRequest();
  assert.equal((await call(`/friends/requests/${id}/accept`, bob, "POST", {
    permissions: restricted, expectedPermissions: allPermissions,
  })).status, 404);
  assert.equal((await call(`/friends/requests/${id}/accept`, alice, "POST", {
    permissions: { view: false },
  })).status, 400);
  await defaults(restricted);
  assert.equal((await call(`/friends/requests/${id}/accept`, alice, "POST", {
    permissions: allPermissions, expectedPermissions: allPermissions,
  })).status, 409);
  await stillPending(id);
  assert.deepEqual((await call("/profile", alice)).body.friendPermissions[bob], restricted);
});

test("acceptance waits for a settings write, then rejects stale choices without widening access", async () => {
  const id = await incomingRequest();
  let accepting: ReturnType<typeof call>;
  let settled = false;
  await db.transaction(async (tx) => {
    await lockPrivacyUpdate(tx, alice);
    accepting = call(`/friends/requests/${id}/accept`, alice, "POST", {
      permissions: allPermissions, expectedPermissions: allPermissions,
    }).then((result) => { settled = true; return result; });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(settled, false, "acceptance cannot bypass the held privacy lock");
    await tx.update(profilesTable).set({ friendPermissions: { [bob]: restricted, [carol]: restricted } })
      .where(eq(profilesTable.memberId, alice));
  });
  assert.equal((await accepting!).status, 409);
  await stillPending(id);
  assert.deepEqual((await call("/profile", alice)).body.friendPermissions, { [bob]: restricted, [carol]: restricted });
});

test("acceptance and the settings endpoint serialize without deadlocking or losing unrelated choices", async () => {
  const id = await incomingRequest();
  let accepting: ReturnType<typeof call>;
  let updating: ReturnType<typeof call>;
  await db.transaction(async (tx) => {
    await lockPrivacyUpdate(tx, alice);
    accepting = call(`/friends/requests/${id}/accept`, alice, "POST", {
      permissions: restricted, expectedPermissions: allPermissions,
    });
    // Let acceptance wait on privacy while holding the member-pair lock.
    await new Promise((resolve) => setTimeout(resolve, 100));
    updating = call("/privacy", alice, "PATCH", { friendPermissions: { [bob]: restricted, [carol]: restricted }, expectedFriendPermissions: {} });
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  const [accepted, updated] = await Promise.all([accepting!, updating!]);
  assert.ok([200, 409].includes(accepted.status));
  assert.ok([200, 409].includes(updated.status));
  assert.ok(accepted.status === 200 || updated.status === 200);
  const saved = (await call("/profile", alice)).body.friendPermissions;
  assert.deepEqual(saved[bob], restricted);
  if (updated.status === 200) assert.deepEqual(saved[carol], restricted);
  if (accepted.status === 409) await stillPending(id);
});

test("a stale settings save after acceptance cannot erase or widen the new friend's restrictions", async () => {
  const id = await incomingRequest();
  assert.equal((await call(`/friends/requests/${id}/accept`, alice, "POST", {
    permissions: restricted, expectedPermissions: allPermissions,
  })).status, 200);
  assert.equal((await call("/privacy", alice, "PATCH", {
    expectedFriendPermissions: {}, friendPermissions: { [carol]: allPermissions },
  })).status, 409);
  assert.deepEqual((await call("/profile", alice)).body.friendPermissions, { [bob]: restricted });
  assert.equal((await call("/privacy", alice, "PATCH", {
    friendPermissions: { [bob]: allPermissions },
  })).status, 400, "old clients must not overwrite defaults without a reviewed snapshot");
});

test("a cancelled request waiting on privacy cannot save defaults or create a friendship", async () => {
  const id = await incomingRequest();
  let accepting: ReturnType<typeof call>;
  await db.transaction(async (tx) => {
    await lockPrivacyUpdate(tx, alice);
    accepting = call(`/friends/requests/${id}/accept`, alice, "POST", {
      permissions: restricted, expectedPermissions: allPermissions,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal((await call(`/friends/requests/${id}`, bob, "DELETE")).status, 204);
  });
  assert.equal((await accepting!).status, 409);
  assert.equal((await call("/profile", alice)).body.friendPermissions[bob], undefined);
  assert.equal((await db.select().from(friendshipsTable).where(or(
    eq(friendshipsTable.memberAId, alice), eq(friendshipsTable.memberBId, alice),
  ))).length, 0);
});

test("a failed privacy save rolls back both acceptance and its chosen defaults", async () => {
  const id = await incomingRequest();
  // Fail only this synthetic member's consent insert, after its defaults update.
  // The real route transaction must undo the defaults and leave the request.
  const name = `privacy_accept_failure_${randomUUID().replaceAll("-", "")}`;
  await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.member_id = '${alice}' THEN RAISE EXCEPTION 'synthetic consent write failure'; END IF;
    RETURN NEW; END $$`);
  try {
    await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON consent_history FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    const result = await call(`/friends/requests/${id}/accept`, alice, "POST", {
      permissions: restricted, expectedPermissions: allPermissions,
    });
    assert.equal(result.status, 500);
    await stillPending(id);
    assert.equal((await call("/profile", alice)).body.friendPermissions[bob], undefined);
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS ${name} ON consent_history`);
    await pool.query(`DROP FUNCTION IF EXISTS ${name}()`);
  }
});
