import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import { db, pool, membersTable, profilesTable, postsTable, friendshipsTable,
  moderationRecordsTable, notificationEventsTable, mediaAssetsTable, consentHistoryTable } from "@workspace/db";
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
  assert.equal((await call("/privacy", alice, "PATCH", { friendPermissions: { [bob]: permissions } })).status, 200);
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
  await db.delete(notificationEventsTable).where(or(inArray(notificationEventsTable.actorMemberId, people), inArray(notificationEventsTable.recipientMemberId, people)));
  await db.delete(moderationRecordsTable).where(inArray(moderationRecordsTable.subjectMemberId, people));
  await db.delete(postsTable).where(inArray(postsTable.authorMemberId, people));
  await db.delete(friendshipsTable).where(inArray(friendshipsTable.memberAId, people));
  await db.update(profilesTable).set({ friendPermissions: {}, selectedFriends: {}, visibility: defaultVisibility() }).where(eq(profilesTable.memberId, alice));
});
after(async () => {
  try {
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
