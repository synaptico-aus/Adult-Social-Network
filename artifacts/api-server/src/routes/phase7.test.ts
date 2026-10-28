import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool, membersTable, mediaAssetsTable, mediaCleanupTasksTable, mediaScreeningResultsTable, postsTable, friendshipsTable, safetyRelationshipsTable, uploadAdmissionsTable } from "@workspace/db";
import { createApp } from "../app.ts";
import { configureTestMediaStorage } from "../lib/media-storage";
import { cleanupExpiredMedia } from "../lib/media-deletion-hook";

const ids = { alice: `phase7-alice-${randomUUID()}`, bob: `phase7-bob-${randomUUID()}`, carol: `phase7-carol-${randomUUID()}` };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const wav = Buffer.alloc(46);
wav.write("RIFF", 0); wav.writeUInt32LE(38, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(2, 40);
const objects = new Map<string, { bytes: Buffer; contentType?: string; deleted?: boolean; delete?: () => Promise<void> }>();
const createdAssets = new Set<string>();
let server: ReturnType<typeof app.listen>;
let base = "";

const authMiddleware = (req: any, _res: any, next: any) => {
  const userId = req.header("x-test-user") ?? null;
  const auth = Object.assign(() => ({ userId, tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true });
  Object.assign(req, { auth }); next();
};
const app = createApp({ authMiddleware });
async function call(path: string, user: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${base}${path}`, { method: options.method ?? "GET", headers: { "x-test-user": user, ...(options.body === undefined ? {} : { "content-type": "application/json" }) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const copy = response.clone();
  return { status: response.status, body: await response.json().catch(() => undefined) as any, bytes: Buffer.from(await copy.arrayBuffer().catch(() => new ArrayBuffer(0))) };
}
async function upload(user: string, key = randomUUID(), provider = false) {
  process.env.MEDIA_TEST_PROVIDER = provider ? "allow" : "";
  const requested = await call("/api/media/uploads/request", user, { method: "POST", body: { kind: "photo", contentType: "image/png", size: png.length, clientIdempotencyKey: key, altText: "a photo" } });
  assert.equal(requested.status, 201);
  createdAssets.add(requested.body.asset.id);
  const path = (await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, requested.body.asset.id)))[0].objectPath;
  const transfer = await fetch(`${base}${requested.body.uploadURL}`, { method: "PUT", headers: { "x-test-user": user, "content-type": "image/png" }, body: png });
  assert.equal(transfer.status, 204);
  return { requested, path, id: requested.body.asset.id, complete: () => call(`/api/media/uploads/${requested.body.asset.id}/complete`, user, { method: "POST" }) };
}

before(async () => {
  process.env.NODE_ENV = "test"; configureTestMediaStorage(objects);
  server = app.listen(0); await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await db.insert(membersTable).values(Object.values(ids).map((id) => ({ id, clerkUserId: id, emailVerified: true })));
});
beforeEach(async () => {
  objects.clear(); process.env.MEDIA_TEST_PROVIDER = "";
  await db.delete(postsTable).where(inArray(postsTable.authorMemberId, Object.values(ids)));
  await db.delete(mediaAssetsTable).where(inArray(mediaAssetsTable.ownerMemberId, Object.values(ids)));
  await db.delete(friendshipsTable).where(and(eq(friendshipsTable.memberAId, ids.alice), eq(friendshipsTable.memberBId, ids.bob)));
  await db.delete(safetyRelationshipsTable).where(inArray(safetyRelationshipsTable.actorMemberId, Object.values(ids)));
});
after(async () => {
  await db.delete(uploadAdmissionsTable).where(inArray(uploadAdmissionsTable.ownerMemberId, Object.values(ids)));
  if (createdAssets.size) await db.delete(mediaCleanupTasksTable).where(inArray(mediaCleanupTasksTable.assetId, [...createdAssets]));
  await db.delete(postsTable).where(inArray(postsTable.authorMemberId, Object.values(ids)));
  await db.delete(mediaAssetsTable).where(inArray(mediaAssetsTable.ownerMemberId, Object.values(ids)));
  await db.delete(friendshipsTable).where(and(eq(friendshipsTable.memberAId, ids.alice), eq(friendshipsTable.memberBId, ids.bob)));
  await db.delete(safetyRelationshipsTable).where(inArray(safetyRelationshipsTable.actorMemberId, Object.values(ids)));
  await db.delete(membersTable).where(inArray(membersTable.id, Object.values(ids)));
  await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve())); server.closeIdleConnections?.(); await pool.end();
});

test("request idempotency returns one asset and completion is idempotent", async () => {
  const key = randomUUID(), one = await upload(ids.alice, key), again = await call("/api/media/uploads/request", ids.alice, { method: "POST", body: { kind: "photo", contentType: "image/png", size: png.length, clientIdempotencyKey: key, altText: "a photo" } });
  assert.equal(again.status, 200); assert.equal(again.body.asset.id, one.id);
  assert.equal((await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.clientIdempotencyKey, key))).length, 1);
  assert.equal((await one.complete()).status, 200); assert.equal((await one.complete()).status, 200);
  assert.equal((await db.select().from(mediaScreeningResultsTable).where(eq(mediaScreeningResultsTable.assetId, one.id))).length, 2);
});

test("interrupted completion is 409 and unsupported or declared-mismatch bytes are rejected", async () => {
  const missing = await upload(ids.alice); objects.delete(missing.path); assert.equal((await missing.complete()).status, 409);
  const bad = await upload(ids.alice); objects.set(bad.path, { bytes: Buffer.from("not media") }); assert.equal((await bad.complete()).status, 422);
  const mismatch = await upload(ids.alice, randomUUID()); objects.set(mismatch.path, { bytes: Buffer.from("RIFFbad") }); assert.equal((await mismatch.complete()).status, 422);
});

test("missing malware and abuse providers hold assets independently and block attachment", async () => {
  const asset = await upload(ids.alice); const held = await asset.complete(); assert.equal(held.body.status, "held");
  assert.equal(held.body.malwareState, "unavailable"); assert.equal(held.body.abuseState, "unavailable");
  assert.equal((await call("/api/posts", ids.alice, { method: "POST", body: { body: "held", mediaAssetIds: [asset.id] } })).status, 409);
  assert.equal((await call(`/api/media/${asset.id}`, ids.alice)).status, 404);
});

test("test-only clean provider permits publication and media bytes", async () => {
  const asset = await upload(ids.alice, randomUUID(), true); const done = await asset.complete();
  assert.equal(done.body.status, "ready"); assert.ok((await call("/api/media/" + asset.id, ids.alice)).bytes.length > 0);
  const post = await call("/api/posts", ids.alice, { method: "POST", body: { body: "with media", audience: "public", mediaAssetIds: [asset.id] } });
  assert.equal(post.status, 201); assert.equal((await call(`/api/posts/${post.body.id}/publish`, ids.alice, { method: "POST" })).status, 200);
});

test("audio transcript correction persists without bypassing missing scans", async () => {
  process.env.MEDIA_TEST_PROVIDER = ""; const req = await call("/api/media/uploads/request", ids.alice, { method: "POST", body: { kind: "audio", contentType: "audio/wav", size: wav.length, clientIdempotencyKey: randomUUID() } });
  const id = req.body.asset.id; const objectPath = (await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, id)))[0].objectPath;
  assert.equal((await fetch(`${base}${req.body.uploadURL}`, { method: "PUT", headers: { "x-test-user": ids.alice, "content-type": "audio/wav" }, body: wav })).status, 204);
  assert.equal((await call(`/api/media/uploads/${id}/complete`, ids.alice, { method: "POST" })).body.status, "held");
  const corrected = await call(`/api/media/${id}/transcript`, ids.alice, { method: "PATCH", body: { transcript: "corrected words" } });
  assert.equal(corrected.body.transcript, "corrected words"); assert.equal(corrected.body.status, "held");
  process.env.MEDIA_TEST_PROVIDER = "allow"; const retried = await call(`/api/media/uploads/${id}/retry`, ids.alice, { method: "POST" }); assert.equal(retried.status, 200);
  assert.equal(retried.body.uploadURL, null); assert.equal(retried.body.asset.status, "ready");
});

test("completed photos freeze bytes and unavailable scanners do not decode them", async () => {
  const asset = await upload(ids.alice);
  const malformed = Buffer.concat([png.subarray(0, 8), Buffer.from("invalid image body")]);
  objects.set(asset.path, { bytes: malformed, contentType: "image/png" });
  const held = await asset.complete();
  assert.equal(held.body.status, "held"); assert.equal(held.body.width, null);
  const [stored] = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id));
  assert.notEqual(stored.objectPath, asset.path);
  objects.set(asset.path, { bytes: png, contentType: "image/png" });
  assert.deepEqual(objects.get(stored.objectPath)?.bytes, malformed);
  process.env.MEDIA_TEST_PROVIDER = "allow";
  const checked = await call(`/api/media/uploads/${asset.id}/retry`, ids.alice, { method: "POST" });
  assert.equal(checked.status, 422); // Frozen malformed bytes cannot be replaced with a clean PUT.
});

test("infected photos are rejected before decoding and cannot be replaced using retry", async () => {
  const asset = await upload(ids.alice);
  process.env.MEDIA_TEST_PROVIDER = "blocked";
  const result = await asset.complete();
  assert.equal(result.body.status, "rejected"); assert.equal(result.body.malwareState, "blocked"); assert.equal(result.body.width, null);
  assert.equal((await call(`/api/media/uploads/${asset.id}/retry`, ids.alice, { method: "POST" })).status, 409);
  assert.equal((await call(`/api/media/${asset.id}`, ids.alice)).status, 404);
});

test("media GET follows only_me, friends, public and live block/audience revocation", async () => {
  const asset = await upload(ids.alice, randomUUID(), true); await asset.complete();
  const post = await call("/api/posts", ids.alice, { method: "POST", body: { body: "private", audience: "public", mediaAssetIds: [asset.id] } }); await call(`/api/posts/${post.body.id}/publish`, ids.alice, { method: "POST" });
  assert.equal((await call(`/api/media/${asset.id}`, ids.bob)).status, 200);
  await call(`/api/posts/${post.body.id}`, ids.alice, { method: "PATCH", body: { audience: "only_me" } }); assert.equal((await call(`/api/media/${asset.id}`, ids.bob)).status, 404);
  await call(`/api/posts/${post.body.id}`, ids.alice, { method: "PATCH", body: { audience: "public" } }); assert.equal((await call(`/api/media/${asset.id}`, ids.bob)).status, 200);
  const [memberA, memberB] = [ids.alice, ids.bob].sort();
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId: memberA, memberBId: memberB });
  await call(`/api/posts/${post.body.id}`, ids.alice, { method: "PATCH", body: { audience: "friends" } }); assert.equal((await call(`/api/media/${asset.id}`, ids.bob)).status, 200);
  await call(`/api/friends/${ids.alice}`, ids.bob, { method: "DELETE" }); assert.equal((await call(`/api/media/${asset.id}`, ids.bob)).status, 404);
  await call("/api/safety/block", ids.alice, { method: "POST", body: { targetMemberId: ids.bob } }); assert.equal((await call(`/api/media/${asset.id}`, ids.bob)).status, 404);
});

test("cancel and retry are idempotent, and orphan cleanup removes expired uploads", async () => {
  const asset = await upload(ids.alice); assert.equal((await call(`/api/media/uploads/${asset.id}/cancel`, ids.alice, { method: "POST" })).status, 204);
  assert.equal((await call(`/api/media/uploads/${asset.id}/cancel`, ids.alice, { method: "POST" })).status, 204);
  assert.equal((await call(`/api/media/uploads/${asset.id}/retry`, ids.alice, { method: "POST" })).status, 409);
  await db.update(mediaAssetsTable).set({ expiresAt: new Date(0) }).where(eq(mediaAssetsTable.id, asset.id));
  assert.equal(await cleanupExpiredMedia(new Date()), 1);
  assert.equal((await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id))).length, 0);
});

test("ready media remains retained as cleanup_pending when object deletion fails", async () => {
  const asset = await upload(ids.alice, randomUUID(), true); await asset.complete();
  const entry = objects.get(asset.path)!; entry.deleted = false;
  entry.delete = async () => { throw new Error("object store unavailable"); };
  const { runDeletionHooks } = await import("../lib/deletion-hooks");
  await runDeletionHooks({ memberId: ids.alice, requestId: randomUUID() });
  assert.equal((await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id))).length, 1);
  assert.equal((await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id)))[0].status, "cleanup_pending");
});