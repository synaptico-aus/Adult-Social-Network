import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, pool, membersTable, postsTable, friendshipsTable, circlesTable, circleMembersTable,
  memoryCollectionsTable, memoryItemsTable, memoryReminderPreferencesTable, hiddenMemoriesTable,
  mediaAssetsTable, resourcesTable, moderationRecordsTable, screeningResultsTable } from "@workspace/db";
import { createApp } from "../app";
import { runDeletionHooks } from "../lib/deletion-hooks";

const ids = { alice: `memory-a-${randomUUID()}`, bob: `memory-b-${randomUUID()}`, charlie: `memory-c-${randomUUID()}` };
const users = Object.values(ids), resourceIds: string[] = [];
const collectionIds = new Set<string>();
const authMiddleware = (req: any, _res: any, next: any) => {
  const userId = req.header("x-test-user") || null;
  req.auth = Object.assign(() => ({ userId, tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true }); next();
};
const app = createApp({ authMiddleware });
let server: ReturnType<typeof app.listen>, base = "";
async function call(path: string, user = ids.alice, method = "GET", body?: unknown) {
  const response = await fetch(`${base}/api${path}`, { method, headers: { ...(user ? { "x-test-user": user } : {}),
    ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => undefined) as any };
}
async function post(owner = ids.alice, audience: "only_me" | "public" | "friends" | "my_circle" = "public", circleId?: string) {
  // Keep public fixtures behind the concurrent feed-cursor tests' new posts.
  const [row] = await db.insert(postsTable).values({ id: randomUUID(), authorMemberId: owner, body: "A real story chosen by its author",
    audience, status: "published", createdAt: new Date("2001-01-01T00:00:00Z"), publishedAt: new Date("2001-01-01T00:00:00Z"), circleId }).returning();
  return row;
}
async function collection(owner = ids.alice, audience = "only_me", scope: object = {}) {
  const result = await call("/memory-collections", owner, "POST", { name: "Chosen memories", audience, shareConsent: audience !== "only_me", ...scope });
  assert.equal(result.status, 201, JSON.stringify(result.body)); collectionIds.add(result.body.id); return result.body;
}
async function add(collectionId: string, sourceId: string, owner = ids.alice, extra: object = {}) {
  return call(`/memory-collections/${collectionId}/items`, owner, "POST", { kind: "post", sourceId, caption: "My own caption", ...extra });
}
async function detail(id: string, user = ids.alice) { return call(`/memory-collections/${id}`, user); }
async function clean() {
  await db.delete(moderationRecordsTable).where(inArray(moderationRecordsTable.subjectMemberId, users));
  if (collectionIds.size) await db.delete(screeningResultsTable).where(inArray(screeningResultsTable.contentId, [...collectionIds]));
  await db.delete(memoryCollectionsTable).where(inArray(memoryCollectionsTable.ownerMemberId, users));
  await db.delete(hiddenMemoriesTable).where(inArray(hiddenMemoriesTable.memberId, users));
  await db.delete(memoryReminderPreferencesTable).where(inArray(memoryReminderPreferencesTable.memberId, users));
  await db.delete(postsTable).where(inArray(postsTable.authorMemberId, users));
  await db.delete(mediaAssetsTable).where(inArray(mediaAssetsTable.ownerMemberId, users));
  await db.delete(circlesTable).where(inArray(circlesTable.ownerMemberId, users));
  await db.delete(friendshipsTable).where(inArray(friendshipsTable.memberAId, users));
  if (resourceIds.length) await db.delete(resourcesTable).where(inArray(resourcesTable.id, resourceIds));
}
before(async () => {
  process.env.NODE_ENV = "test";
  await db.insert(membersTable).values(users.map(id => ({ id, clerkUserId: id, emailVerified: true })));
  server = app.listen(0); await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(clean);
after(async () => {
  await clean(); await db.delete(membersTable).where(inArray(membersTable.id, users));
  server.closeIdleConnections?.(); await new Promise<void>(resolve => server.close(() => resolve())); await pool.end();
});

test("private by default; deliberate sharing cannot widen original only-me items", async () => {
  assert.equal((await call("/memory-collections", "")).status, 401);
  assert.equal((await call("/memory-collections", ids.alice, "POST", { name: "Share?", audience: "public" })).status, 400);
  const source = await post(ids.alice, "only_me"), group = await collection();
  assert.equal(group.audience, "only_me"); assert.equal(group.sharingHeld, false);
  assert.equal((await add(group.id, source.id)).status, 201);
  assert.equal((await detail(group.id, ids.bob)).status, 404);
  assert.equal((await call(`/memory-collections/${group.id}`, ids.alice, "PATCH", { audience: "public" })).status, 400);
  assert.equal((await call(`/memory-collections/${group.id}`, ids.alice, "PATCH", { audience: "public", shareConsent: true })).status, 200);
  const shared = await detail(group.id, ids.bob);
  assert.equal(shared.status, 200); assert.equal(shared.body.items[0].unavailable, true);
  for (const field of ["body", "sourceId", "caption", "authorName", "mediaUrl", "transcript", "url", "title"])
    assert.equal(shared.body.items[0][field], null, field);
  assert.equal((await detail(group.id)).body.items[0].body, source.body);
  assert.equal((await add(group.id, source.id, ids.bob)).status, 404);
  assert.equal((await call(`/memory-collections/${group.id}/export`, ids.bob)).status, 403);
});

test("friend access revocation also invalidates the curator's reference for other viewers", async () => {
  const [memberA, memberB] = [ids.alice, ids.bob].sort();
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId: memberA, memberBId: memberB });
  const source = await post(ids.alice, "friends"), group = await collection(ids.bob, "public");
  assert.equal((await add(group.id, source.id, ids.bob)).status, 201);
  assert.equal((await detail(group.id, ids.alice)).body.items[0].unavailable, false);
  assert.equal((await detail(group.id, ids.charlie)).body.items[0].unavailable, true);
  await db.delete(friendshipsTable).where(eq(friendshipsTable.memberAId, memberA));
  assert.equal((await detail(group.id, ids.bob)).body.items[0].unavailable, true);
  assert.equal((await detail(group.id, ids.alice)).body.items[0].unavailable, true);
  assert.equal((await call(`/memory-collections/${group.id}/export`, ids.bob)).body.items[0].body, null);
});

test("circle removal, rejoin history and collection audience revocation are live", async () => {
  const circleId = randomUUID();
  await db.insert(circlesTable).values({ id: circleId, ownerMemberId: ids.alice, name: "Private circle" });
  const memberships = users.map((memberId) => ({ id: randomUUID(), circleId, memberId, role: memberId === ids.alice ? "owner" as const : "member" as const, joinedAt: new Date(0) }));
  await db.insert(circleMembersTable).values(memberships);
  const source = await post(ids.alice, "my_circle", circleId), publicGroup = await collection(ids.bob, "public");
  assert.equal((await add(publicGroup.id, source.id, ids.bob)).status, 201);
  assert.equal((await detail(publicGroup.id, ids.charlie)).body.items[0].unavailable, false);
  const scoped = await collection(ids.alice, "my_circle", { circleId });
  assert.equal((await detail(scoped.id, ids.charlie)).status, 200);
  await db.update(circleMembersTable).set({ status: "removed" }).where(eq(circleMembersTable.id, memberships[2].id));
  assert.equal((await detail(scoped.id, ids.charlie)).status, 404);
  assert.equal((await detail(publicGroup.id, ids.charlie)).body.items[0].unavailable, true);
  await db.update(circleMembersTable).set({ status: "removed" }).where(eq(circleMembersTable.id, memberships[1].id));
  assert.equal((await detail(publicGroup.id, ids.alice)).body.items[0].unavailable, true);
  await db.update(circleMembersTable).set({ status: "active", joinedAt: new Date(Date.now() + 10000) }).where(eq(circleMembersTable.id, memberships[1].id));
  assert.equal((await detail(publicGroup.id, ids.bob)).body.items[0].unavailable, true);
});

test("deletion removes source content, attribution and captions throughout collections", async () => {
  const source = await post(), first = await collection(), second = await collection();
  await add(first.id, source.id); await add(second.id, source.id);
  await db.update(postsTable).set({ status: "deleted", deletedAt: new Date() }).where(eq(postsTable.id, source.id));
  for (const id of [first.id, second.id]) {
    const result = await detail(id);
    assert.equal(result.body.items[0].unavailable, true); assert.equal(result.body.items[0].caption, null);
    assert.equal((await call(`/memory-collections/${id}/export`)).body.items[0].body, null);
  }
});

test("photo and audio playback/transcript references require live ready original attachments", async () => {
  const source = await post(), group = await collection(ids.alice, "public");
  const photo = randomUUID(), audio = randomUUID();
  await db.insert(mediaAssetsTable).values([
    { id: photo, ownerMemberId: ids.alice, kind: "photo", objectPath: `/objects/media/${ids.alice}/${photo}`, clientIdempotencyKey: photo, requestedContentType: "image/png", status: "ready", altText: "An actual photo", expiresAt: new Date(Date.now() + 86400000) },
    { id: audio, ownerMemberId: ids.alice, kind: "audio", objectPath: `/objects/media/${ids.alice}/${audio}`, clientIdempotencyKey: audio, requestedContentType: "audio/wav", status: "ready", transcript: "The real recorded words", expiresAt: new Date(Date.now() + 86400000) },
  ]);
  await db.update(postsTable).set({ mediaAssetIds: [photo, audio] }).where(eq(postsTable.id, source.id));
  assert.equal((await add(group.id, photo, ids.alice, { kind: "photo", sourcePostId: source.id })).status, 201);
  assert.equal((await add(group.id, audio, ids.alice, { kind: "audio", sourcePostId: source.id })).status, 201);
  const live = (await detail(group.id, ids.bob)).body.items;
  assert.equal(live[0].mediaUrl, `/api/media/${photo}`); assert.equal(live[1].transcript, "The real recorded words");
  assert.equal(live[1].authorMemberId, ids.alice);
  await db.update(mediaAssetsTable).set({ status: "held" }).where(eq(mediaAssetsTable.id, audio));
  assert.equal((await detail(group.id, ids.bob)).body.items[1].transcript, null);
  await db.update(postsTable).set({ mediaAssetIds: [] }).where(eq(postsTable.id, source.id));
  assert.equal((await detail(group.id)).body.items[0].mediaUrl, null);
});

test("music remains an external rights-respecting reference and disappears when removed", async () => {
  const resourceId = randomUUID(); resourceIds.push(resourceId);
  await db.insert(resourcesTable).values({ id: resourceId, url: "https://example.com/music", domain: "example.com", title: "A music link",
    category: "music", region: "Australia", status: "reviewed", editorId: ids.alice, linkState: "reachable" });
  const group = await collection();
  assert.equal((await add(group.id, resourceId, ids.alice, { kind: "music" })).status, 201);
  const exported = (await call(`/memory-collections/${group.id}/export`)).body.items[0];
  assert.equal(exported.url, "https://example.com/music"); assert.equal(exported.mediaUrl, null); assert.equal(exported.body, null);
  await db.update(resourcesTable).set({ status: "removed" }).where(eq(resourcesTable.id, resourceId));
  assert.equal((await detail(group.id)).body.items[0].url, null);
});

test("reminders require consent; per-memory hides cross collections; disabling removes every reminder", async () => {
  const source = await post(), first = await collection(), second = await collection();
  const item = await add(first.id, source.id); await add(second.id, source.id);
  assert.equal((await call("/memory-reminder-preferences")).body.enabled, false);
  assert.deepEqual((await call("/memory-reminders")).body, []);
  assert.equal((await call("/memory-reminder-preferences", ids.alice, "PATCH", { enabled: true })).status, 400);
  assert.equal((await call("/memory-reminder-preferences", ids.alice, "PATCH", { enabled: true, consent: true })).status, 200);
  assert.equal((await call("/memory-reminders")).body.length, 1);
  await call(`/memory-collections/${first.id}/items/${item.body.id}/hide`, ids.alice, "POST", { hidden: true });
  assert.deepEqual((await call("/memory-reminders")).body, []);
  assert.equal((await detail(second.id)).body.items[0].hidden, true);
  await call(`/memory-collections/${first.id}/items/${item.body.id}/hide`, ids.alice, "POST", { hidden: false });
  assert.equal((await call("/memory-reminders")).body.length, 1);
  await call("/memory-reminder-preferences", ids.alice, "PATCH", { enabled: false });
  assert.deepEqual((await call("/memory-reminders")).body, []);
  assert.equal((await call("/memory-reminder-preferences")).body.consentedAt, null);
});

test("caption changes, exact reorder, ownership-safe removal and references-only foreign exports", async () => {
  const source = await post(ids.alice), group = await collection(ids.bob), own = await post(ids.bob);
  const a = await add(group.id, source.id, ids.bob), b = await add(group.id, own.id, ids.bob);
  assert.equal((await call(`/memory-collections/${group.id}/order`, ids.bob, "PUT", { itemIds: [a.body.id] })).status, 409);
  assert.equal((await call(`/memory-collections/${group.id}/order`, ids.bob, "PUT", { itemIds: [b.body.id, a.body.id] })).status, 204);
  assert.equal((await call(`/memory-collections/${group.id}/items/${b.body.id}`, ids.bob, "PATCH", { caption: "An updated personal caption" })).status, 200);
  const exported = (await call(`/memory-collections/${group.id}/export`, ids.bob)).body.items;
  assert.equal(exported[0].id, b.body.id); assert.equal(exported[0].body, own.body); assert.equal(exported[0].caption, "An updated personal caption");
  assert.equal(exported[1].body, null); assert.equal(exported[1].authorMemberId, ids.alice);
  const profileExport = await call("/profile/export", ids.bob);
  assert.equal(profileExport.body.memoryData.collections[0].items[1].body, null);
  await call(`/memory-collections/${group.id}/items/${a.body.id}`, ids.bob, "DELETE");
  assert.equal((await db.select().from(postsTable).where(eq(postsTable.id, source.id))).length, 1);
  await call(`/memory-collections/${group.id}`, ids.bob, "DELETE");
  assert.equal((await db.select().from(memoryItemsTable).where(eq(memoryItemsTable.collectionId, group.id))).length, 0);
  assert.equal((await db.select().from(postsTable).where(eq(postsTable.id, own.id))).length, 1);
});

test("account deletion hooks erase collections and reminder preferences without deleting others' originals", async () => {
  const source = await post(ids.alice), group = await collection(ids.bob);
  const bobsSource = await post(ids.bob), alicesCollection = await collection(ids.alice);
  await add(alicesCollection.id, bobsSource.id, ids.alice);
  const item = await add(group.id, source.id, ids.bob);
  await call("/memory-reminder-preferences", ids.bob, "PATCH", { enabled: true, consent: true });
  await call(`/memory-collections/${group.id}/items/${item.body.id}/hide`, ids.bob, "POST", { hidden: true });
  await runDeletionHooks({ memberId: ids.bob, requestId: randomUUID() });
  assert.equal((await db.select().from(memoryCollectionsTable).where(eq(memoryCollectionsTable.id, group.id))).length, 0);
  assert.equal((await db.select().from(memoryReminderPreferencesTable).where(eq(memoryReminderPreferencesTable.memberId, ids.bob))).length, 0);
  assert.equal((await db.select().from(hiddenMemoriesTable).where(eq(hiddenMemoriesTable.memberId, ids.bob))).length, 0);
  assert.equal((await db.select().from(postsTable).where(eq(postsTable.id, source.id))).length, 1);
  const survivor = await detail(alicesCollection.id, ids.alice);
  assert.equal(survivor.status, 200); assert.equal(survivor.body.items[0].unavailable, true);
});

test("collection metadata approval binds to the complete current name and caption revision", async () => {
  const source = await post(), group = await collection(ids.alice, "public");
  const item = await add(group.id, source.id);
  assert.equal((await detail(group.id, ids.bob)).status, 200);
  const held = await call(`/memory-collections/${group.id}/items/${item.body.id}`, ids.alice, "PATCH", { caption: "how to poison" });
  assert.equal(held.status, 200);
  assert.equal((await detail(group.id, ids.bob)).status, 404);
  assert.equal((await detail(group.id)).body.collection.sharingHeld, true);
  await call(`/memory-collections/${group.id}`, ids.alice, "PATCH", { name: "A safe new name" });
  assert.equal((await detail(group.id, ids.bob)).status, 404); // Renaming cannot bypass a held caption.
  await call(`/memory-collections/${group.id}/items/${item.body.id}`, ids.alice, "PATCH", { caption: "My chosen caption" });
  assert.equal((await detail(group.id, ids.bob)).status, 200);
});

test("source revocation immediately suppresses opted-in reminders and borrowed content in account exports", async () => {
  const source = await post(ids.alice), group = await collection(ids.bob);
  await add(group.id, source.id, ids.bob);
  await call("/memory-reminder-preferences", ids.bob, "PATCH", { enabled: true, consent: true });
  assert.equal((await call("/memory-reminders", ids.bob)).body.length, 1);
  await db.update(postsTable).set({ audience: "only_me" }).where(eq(postsTable.id, source.id));
  assert.deepEqual((await call("/memory-reminders", ids.bob)).body, []);
  const data = (await call("/profile/export", ids.bob)).body.memoryData;
  assert.equal(data.collections[0].items[0].unavailable, true);
  assert.equal(data.collections[0].items[0].caption, null);
});
