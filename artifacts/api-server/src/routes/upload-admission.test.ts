import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool, membersTable, mediaAssetsTable, postsTable, retainedEvidenceTable, uploadAdmissionsTable as admissions } from "@workspace/db";
import { cleanupUploadAdmissions } from "../lib/upload-cleanup";
import { configureTestMediaStorage } from "../lib/media-storage";
import { UPLOAD_LIMITS } from "../lib/upload-admission";
import { runDeletionHooks } from "../lib/deletion-hooks";
import { mediaHasRetainedEvidence } from "../lib/media-deletion-hook";

const prefix = `admission-test-${randomUUID()}`;
const owners = Array.from({ length: 40 }, (_, i) => `${prefix}-${i}`);
const children: ChildProcess[] = [];
const bases: string[] = [];
async function instance() {
  const index = children.length;
  const child = fork(new URL("../test-support/upload-instance.ts", import.meta.url), {
    execArgv: ["--import", "tsx"], env: { ...process.env, NODE_ENV: "test", LOG_LEVEL: "silent" }, stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  children.push(child);
  const [{ port }] = await Promise.race([
    once(child, "message"),
    once(child, "exit").then(() => { throw new Error("Upload test instance failed to start"); }),
    new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error("Upload test instance startup timed out")), 15000); timer.unref(); }),
  ]) as [{ port: number }];
  bases[index] = `http://127.0.0.1:${port}`;
}
async function call(instance: number, path: string, user = owners[0], body?: unknown) {
  return fetch(`${bases[instance]}/api${path}`, { method: body === undefined ? "GET" : "POST", headers: { "x-test-user": user, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function media(instance = 0, size = 8, user = owners[0], key = randomUUID()) {
  return call(instance, "/media/uploads/request", user, { kind: "photo", contentType: "image/png", size, altText: "Synthetic admission test", clientIdempotencyKey: key });
}
async function profile(instance = 0, size = 8, user = owners[0]) {
  return call(instance, "/profile/photo/upload-url", user, { contentType: "image/png", size });
}
async function objects(instance: number) {
  const message = once(children[instance], "message");
  children[instance].send("objects");
  return (await message)[0].objects as { path: string; bytes: number }[];
}
async function clear() {
  await db.delete(admissions).where(inArray(admissions.ownerMemberId, owners));
  await db.delete(mediaAssetsTable).where(inArray(mediaAssetsTable.ownerMemberId, owners));
}
before(async () => {
  process.env.NODE_ENV = "test";
  configureTestMediaStorage(new Map());
  await db.insert(membersTable).values(owners.map(id => ({ id, clerkUserId: id, active: true, emailVerified: true, ageEligible: true })));
  await Promise.all([instance(), instance()]);
});
after(async () => {
  for (const child of children) if (child.connected) { const exit = once(child, "exit"); child.send("stop"); await exit; }
  await clear();
  await db.delete(membersTable).where(inArray(membersTable.id, owners));
  await pool.end();
});
test("real HTTP media and profile oversized/chunked transfers are refused before storage accepts any bytes", async () => {
  await clear();
  for (const request of [media, profile]) {
    const grant = await request();
    assert.equal(grant.status, request === media ? 201 : 200);
    const body = await grant.json() as any;
    assert.match(body.uploadURL, /^\/api\/uploads\/[^/]+\/bytes$/);
    const other = await fetch(`${bases[1]}${body.uploadURL}`, { method: "PUT", headers: { "x-test-user": owners[1], "content-type": "image/png" }, body: Buffer.alloc(9) });
    assert.equal(other.status, 404);
    const oversized = await fetch(`${bases[0]}${body.uploadURL}`, { method: "PUT", headers: { "x-test-user": owners[0], "content-type": "image/png" }, body: Buffer.alloc(9) });
    assert.equal(oversized.status, 413);
    const second = await request(1, 8, owners[1]);
    const session = await second.json() as any;
    const chunked = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(`${bases[1]}${session.uploadURL}`, { method: "PUT", headers: { "x-test-user": owners[1], "content-type": "image/png", "transfer-encoding": "chunked" } }, res => { res.resume(); resolve(res.statusCode!); });
      req.on("error", reject);
      req.write(Buffer.alloc(5)); req.end(Buffer.alloc(4));
    });
    assert.equal(chunked, 413);
  }
  assert.deepEqual(await objects(0), []);
  assert.deepEqual(await objects(1), []);
});
test("two API processes share account in-flight admission across media and profile, including idempotency", async () => {
  await clear();
  const key = randomUUID();
  const duplicates = await Promise.all(Array.from({ length: 6 }, (_, i) => media(i % 2, 8, owners[2], key)));
  assert.ok(duplicates.every(r => [200, 201].includes(r.status)));
  const sessions = await Promise.all(duplicates.map(r => r.json())) as any[];
  assert.equal(new Set(sessions.map(s => s.asset.id)).size, 1);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => i % 2 ? media(1, 8, owners[2]) : profile(0, 8, owners[2])));
  assert.equal(results.filter(r => r.ok).length, UPLOAD_LIMITS.accountInFlight - 1);
  assert.ok(results.filter(r => !r.ok).every(r => r.status === 429));
});
test("global in-flight and aggregate byte quotas hold across independent API processes", async () => {
  await clear();
  const results = await Promise.all(owners.slice(0, 36).map((owner, i) => profile(i % 2, 8, owner)));
  assert.equal(results.filter(r => r.ok).length, UPLOAD_LIMITS.globalInFlight);
  assert.ok(results.filter(r => !r.ok).every(r => r.status === 429));
  await clear();
  // Precharged synthetic stored reservations isolate byte limits from slot limits.
  await db.insert(admissions).values({
    id: randomUUID(), ownerMemberId: owners[0], resourceId: randomUUID(), purpose: "media", objectPath: `/objects/media/${owners[0]}/${randomUUID()}`,
    contentType: "video/mp4", byteSize: UPLOAD_LIMITS.accountBytes - 10, state: "stored", expiresAt: new Date(Date.now() + 86400000),
  });
  const account = await Promise.all([media(0, 8), profile(1, 8)]);
  assert.equal(account.filter(r => r.ok).length, 1);
  assert.equal(account.filter(r => r.status === 429).length, 1);
  await clear();
  await db.insert(admissions).values(Array.from({ length: 6 }, (_, i) => ({
    id: randomUUID(), ownerMemberId: owners[i + 4], resourceId: randomUUID(), purpose: "media" as const, objectPath: `/objects/media/${owners[i + 4]}/${randomUUID()}`,
    contentType: "video/mp4", byteSize: Math.floor((UPLOAD_LIMITS.globalBytes - 10) / 6), state: "stored" as const, expiresAt: new Date(Date.now() + 86400000),
  })));
  const global = await Promise.all([media(0, 8, owners[20]), profile(1, 8, owners[21])]);
  assert.equal(global.filter(r => r.ok).length, 1);
  assert.equal(global.filter(r => r.status === 429).length, 1);
});
test("exact transfers are single use, recover without another grant, and do not publish media", async () => {
  await clear();
  const grant = await media(0, 8, owners[3]);
  const session = await grant.json() as any;
  const transfer = (instance = 0) => fetch(`${bases[instance]}${session.uploadURL}`, { method: "PUT", headers: { "x-test-user": owners[3], "content-type": "image/png" }, body: Buffer.alloc(8) });
  assert.equal((await call(0, `/media/uploads/${session.asset.id}/complete`, owners[3], {})).status, 409);
  const concurrent = await Promise.all([transfer(0), transfer(1)]);
  assert.deepEqual(concurrent.map(r => r.status).sort(), [204, 409]);
  assert.equal((await transfer()).status, 409);
  const retry = await call(1, `/media/uploads/${session.asset.id}/retry`, owners[3], {});
  assert.equal(retry.status, 200);
  assert.equal((await retry.json() as any).uploadURL, null);
  assert.equal((await call(0, `/media/${session.asset.id}`, owners[3])).status, 404);
  const stored = [...await objects(0), ...await objects(1)];
  assert.equal(stored.filter(o => o.path.includes(owners[3])).length, 1);
});
test("cancelled profile reservations cannot write, and rolling issuance budgets survive release", async () => {
  await clear();
  const grant = await profile(0, 8, owners[5]);
  const session = await grant.json() as any;
  const id = session.uploadURL.split("/")[3];
  assert.equal((await call(1, `/uploads/${id}/cancel`, owners[6], {})).status, 404);
  assert.equal((await call(1, `/uploads/${id}/cancel`, owners[5], {})).status, 204);
  const transfer = await fetch(`${bases[0]}${session.uploadURL}`, { method: "PUT", headers: { "x-test-user": owners[5], "content-type": "image/png" }, body: Buffer.alloc(8) });
  assert.equal(transfer.status, 409);
  await db.update(admissions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(admissions.id, id));
  await cleanupUploadAdmissions();
  assert.equal((await db.select().from(admissions).where(eq(admissions.id, id)))[0].state, "released");
  await db.update(admissions).set({ byteSize: UPLOAD_LIMITS.accountDailyBytes }).where(eq(admissions.id, id));
  assert.equal((await profile(0, 8, owners[5])).status, 429);
});
test("expiry and failed deletion retain charges; successful cleanup releases them and retry reserves again", async () => {
  await clear();
  const grant = await media(0, 8, owners[4]);
  const session = await grant.json() as any;
  const id = session.uploadURL.split("/")[3];
  await db.update(admissions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(admissions.id, id));
  const expired = await fetch(`${bases[1]}${session.uploadURL}`, { method: "PUT", headers: { "x-test-user": owners[4], "content-type": "image/png" }, body: Buffer.alloc(8) });
  assert.equal(expired.status, 409);
  const [row] = await db.select().from(admissions).where(eq(admissions.id, id));
  const map = new Map([[row.objectPath, { bytes: Buffer.alloc(8), delete: async () => { throw new Error("Synthetic storage failure"); } }]]);
  configureTestMediaStorage(map);
  await cleanupUploadAdmissions();
  assert.equal((await db.select().from(admissions).where(eq(admissions.id, id)))[0].state, "reserved");
  configureTestMediaStorage(new Map());
  await cleanupUploadAdmissions();
  assert.equal((await db.select().from(admissions).where(eq(admissions.id, id)))[0].state, "cleanup");
  await db.update(admissions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(admissions.id, id));
  await cleanupUploadAdmissions();
  assert.equal((await db.select().from(admissions).where(eq(admissions.id, id)))[0].state, "released");
  const retry = await call(1, `/media/uploads/${session.asset.id}/retry`, owners[4], {});
  assert.equal(retry.status, 200);
  assert.notEqual((await retry.json() as any).uploadURL, session.uploadURL);
  const live = await db.select().from(admissions).where(and(eq(admissions.resourceId, session.asset.id), sql`state <> 'released'`));
  assert.equal(live.length, 1);
});

test("account deletion preserves retained photo/audio objects and their byte charges through admission cleanup", async () => {
  await clear();
  const map = new Map<string, { bytes: Buffer; contentType: string; deleted?: boolean }>();
  configureTestMediaStorage(map);
  const evidenceIds: string[] = [], postIds: string[] = [];
  try {
    for (const [index, kind] of (["photo", "audio"] as const).entries()) {
      const owner = owners[index + 7], id = randomUUID(), postId = randomUUID(), evidenceId = randomUUID();
      const path = `/objects/media/${owner}/${id}`;
      const bytes = Buffer.from(`Synthetic retained ${kind} evidence`);
      const contentType = kind === "photo" ? "image/png" : "audio/wav";
      const expired = new Date(Date.now() - 86400000);
      map.set(path, { bytes, contentType });
      const [asset] = await db.insert(mediaAssetsTable).values({ id, ownerMemberId: owner, kind, objectPath: path,
        clientIdempotencyKey: id, requestedContentType: contentType, contentType, byteSize: bytes.length,
        status: "ready", malwareState: "allowed", abuseState: "allowed", expiresAt: expired }).returning();
      await db.insert(admissions).values({ id: randomUUID(), ownerMemberId: owner, resourceId: id,
        purpose: "media", objectPath: path, contentType, byteSize: bytes.length, state: "stored", expiresAt: expired });
      await db.insert(postsTable).values({ id: postId, authorMemberId: owner, body: "Synthetic retained-content test", mediaAssetIds: [id] });
      postIds.push(postId);
      await db.insert(retainedEvidenceTable).values({ id: evidenceId, reportId: randomUUID(), contentId: postId, contentKind: "post",
        authorMemberId: owner, bodySnapshot: "Synthetic retained-content snapshot", policyVersion: "test", retentionReason: "Reported evidence" });
      evidenceIds.push(evidenceId);
      assert.equal(await mediaHasRetainedEvidence(asset), true);
      // Account deletion deactivates the member before running module hooks.
      await db.update(membersTable).set({ active: false, deletedAt: new Date() }).where(eq(membersTable.id, owner));
      await runDeletionHooks({ memberId: owner, requestId: randomUUID() }, async (name, run) => {
        if (name === "phase-7-media") await run();
      });
      assert.equal((await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, id)))[0].status, "cleanup_pending");
      await cleanupUploadAdmissions();
      assert.deepEqual(map.get(path)?.bytes, bytes);
      assert.notEqual(map.get(path)?.deleted, true, "retained source must not be deleted because its owner is inactive");
      assert.equal((await db.select().from(admissions).where(eq(admissions.resourceId, id)))[0].state, "stored", "retained bytes must stay charged");
    }
  } finally {
    if (evidenceIds.length) await db.delete(retainedEvidenceTable).where(inArray(retainedEvidenceTable.id, evidenceIds));
    if (postIds.length) await db.delete(postsTable).where(inArray(postsTable.id, postIds));
    await db.update(membersTable).set({ active: true, deletedAt: null }).where(inArray(membersTable.id, owners.slice(7, 9)));
    await clear();
    configureTestMediaStorage(new Map());
  }
});
