import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db, membersTable, mediaAssetsTable, mediaVariantsTable, mediaCleanupTasksTable, mediaScreeningResultsTable, postsTable, friendshipsTable, safetyRelationshipsTable, staffRoleAssignmentsTable, videoJobsTable, uploadAdmissionsTable } from "@workspace/db";
import { createApp } from "../app";
import { configureTestMediaStorage } from "../lib/media-storage";
import { runVideoJobOnce, runMediaTool, validateVideoProbe } from "../lib/video-processing";
import { videoRange, captionVtt, validateCaptionCues } from "../lib/video-delivery";
import { cleanupExpiredMedia } from "../lib/media-deletion-hook";
import { validateDeclared, REEL_LIMIT, VIDEO_LIMIT } from "../lib/media-validation";
import { resetRateLimitBuckets } from "../middlewares/account-auth";
const ids = { alice: `video-owner-${randomUUID()}`, bob: `video-reviewer-${randomUUID()}`, carol: `video-outsider-${randomUUID()}` };
const objects = new Map<string, { bytes: Buffer; contentType?: string; deleted?: boolean }>();
const createdAssets = new Set<string>();
let bytes: Buffer, directory: string;
const app = createApp({ authMiddleware: (req: any, _res: any, next: any) => {
  const auth = Object.assign(() => ({ userId: req.header("x-test-user") ?? null, tokenType: "session_token",
    sessionClaims: { fva: req.header("x-stale") ? [10, 10] : [0, 0] } }), { [Symbol.for("@clerk/express.auth")]: true });
  req.auth = auth; next();
} });
let server: ReturnType<typeof app.listen>, base: string;
async function call(path: string, user?: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const response = await fetch(`${base}${path}`, { method: options.method ?? "GET", headers: { ...(user ? { "x-test-user": user } : {}),
    ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...options.headers }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text();
  let body: any; try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body, headers: response.headers };
}
async function upload() {
  const result = await call("/api/media/uploads/request", ids.alice, { method: "POST", body: {
    kind: "video", videoFormat: "reel", contentType: "video/mp4", size: bytes.length, clientIdempotencyKey: randomUUID() } });
  assert.equal(result.status, 201);
  const id = result.body.asset.id;
  createdAssets.add(id);
  const [asset] = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, id));
  assert.equal((await fetch(`${base}${result.body.uploadURL}`, { method: "PUT", headers: { "x-test-user": ids.alice, "content-type": "video/mp4" }, body: bytes })).status, 204);
  return { id, path: asset.objectPath };
}
async function processVideo(allowMalware = true) {
  process.env.MEDIA_TEST_PROVIDER = allowMalware ? "allow" : "";
  const video = await upload();
  const complete = await call(`/api/media/uploads/${video.id}/complete`, ids.alice, { method: "POST" });
  assert.equal(complete.status, 200); assert.equal(complete.body.status, "quarantined");
  assert.equal(await runVideoJobOnce(), true);
  const status = await call(`/api/media/${video.id}/status`, ids.alice);
  assert.equal(status.body.status, allowMalware ? "held" : "quarantined", status.body.limitation);
  assert.equal(status.body.playbackVariants.includes("standard"), allowMalware, status.body.limitation);
  return video;
}
const captions = { captionVersion: 0, captionState: "provided", cues: [{ start: 0, end: 1, text: "A friendly test video." }] };
async function approve(id: string, reviewer = ids.bob, version = 1) {
  assert.equal((await call(`/api/staff/video-review/${id}/assets/standard?reason=Full%20video%20and%20audio%20review`, reviewer)).status, 200);
  return call(`/api/staff/video-review/${id}/decision`, reviewer, { method: "POST", body: {
    decision: "allow", reason: "Watched all frames, listened to the full audio and reviewed captions", captionVersion: version, watchedEntireVideo: true, listenedEntireAudio: true } });
}
before(async () => {
  process.env.NODE_ENV = "test"; configureTestMediaStorage(objects);
  directory = await mkdtemp(join(tmpdir(), "phase13-tests-"));
  const path = join(directory, "fixture.mp4");
  await runMediaTool("ffmpeg", ["-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=purple:s=144x256:r=24:d=2",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", path]);
  bytes = await readFile(path);
  await db.insert(membersTable).values(Object.values(ids).map((id) => ({ id, clerkUserId: id, emailVerified: true })));
  await db.insert(staffRoleAssignmentsTable).values([ids.alice, ids.bob].map((id) => ({ id: randomUUID(), clerkUserId: id, role: "moderator" as const })));
  server = app.listen(0); await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(async () => {
  await db.delete(uploadAdmissionsTable).where(inArray(uploadAdmissionsTable.ownerMemberId, Object.values(ids)));
  resetRateLimitBuckets(); objects.clear(); process.env.MEDIA_TEST_PROVIDER = "";
  await db.delete(postsTable).where(inArray(postsTable.authorMemberId, Object.values(ids)));
  await db.delete(mediaAssetsTable).where(inArray(mediaAssetsTable.ownerMemberId, Object.values(ids)));
  await db.delete(safetyRelationshipsTable).where(inArray(safetyRelationshipsTable.actorMemberId, Object.values(ids)));
  await db.delete(friendshipsTable).where(inArray(friendshipsTable.memberAId, Object.values(ids)));
});
after(async () => {
  await db.delete(uploadAdmissionsTable).where(inArray(uploadAdmissionsTable.ownerMemberId, Object.values(ids)));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.delete(postsTable).where(inArray(postsTable.authorMemberId, Object.values(ids)));
  await db.delete(staffRoleAssignmentsTable).where(inArray(staffRoleAssignmentsTable.clerkUserId, Object.values(ids)));
  await db.delete(membersTable).where(inArray(membersTable.id, Object.values(ids)));
  if (createdAssets.size) await db.delete(mediaCleanupTasksTable).where(inArray(mediaCleanupTasksTable.assetId, [...createdAssets]));
  configureTestMediaStorage(null); await rm(directory, { force: true, recursive: true });
});
test("video limits, containers, portrait duration, captions and ranges are explicit", () => {
  assert.throws(() => validateDeclared("video", "video/mp4", REEL_LIMIT + 1, "reel"));
  assert.throws(() => validateDeclared("video", "video/mp4", VIDEO_LIMIT + 1, "post"));
  assert.throws(() => validateDeclared("video", "text/html", 100, "post"));
  const probe = { streams: [{ codec_type: "video", width: 144, height: 256, avg_frame_rate: "24/1" }], format: { duration: "121" } };
  assert.throws(() => validateVideoProbe(probe, "reel"));
  assert.equal(validateVideoProbe(probe, "post").durationSeconds, 121);
  assert.throws(() => validateVideoProbe({ ...probe, format: { duration: "601" } }, "post"));
  assert.throws(() => validateVideoProbe({ ...probe, format: { duration: "5" }, streams: [{ codec_type: "video", width: 256, height: 144, avg_frame_rate: "24/1" }] }, "reel"));
  assert.throws(() => videoRange("bytes=0-1,4-6", 100));
  assert.throws(() => videoRange("bytes=100-", 100));
  assert.deepEqual(videoRange("bytes=-5", 100), { start: 95, end: 99 });
  assert.throws(() => validateCaptionCues([{ start: 1, end: 3, text: "bad" }], 2));
  assert.throws(() => validateCaptionCues([{ start: 0, end: 1, text: "a" }, { start: .5, end: 1, text: "b" }], 2));
  assert.equal(captionVtt([{ start: 0, end: 1, text: "<script>\nSTYLE" }]).includes("<script>"), false);
});
test("completion snapshots source, worker creates private variants and sampled coverage stays held", async () => {
  const video = await upload();
  process.env.MEDIA_TEST_PROVIDER = "allow";
  assert.equal((await call(`/api/media/uploads/${video.id}/complete`, ids.alice, { method: "POST" })).body.status, "quarantined");
  objects.set(video.path, { bytes: Buffer.from("<script>replaced PUT</script>") });
  assert.equal((await call(`/api/media/uploads/${video.id}/retry`, ids.alice, { method: "POST" })).status, 409);
  assert.equal(await runVideoJobOnce(), true);
  const state = await call(`/api/media/${video.id}/status`, ids.alice);
  assert.equal(state.body.status, "held");
  assert.equal(state.body.durationSeconds, 2);
  assert.equal(state.body.malwareState, "allowed");
  assert.equal(state.body.abuseState, "unavailable");
  const variants = await db.select().from(mediaVariantsTable).where(eq(mediaVariantsTable.assetId, video.id));
  assert.deepEqual(variants.map((v) => v.kind).sort(), ["audio", "frames", "low", "standard", "thumbnail", "webm"]);
  const results = await db.select().from(mediaScreeningResultsTable).where(eq(mediaScreeningResultsTable.assetId, video.id));
  assert.ok(results.some((r) => r.kind === "video_frames" && r.state === "unavailable"));
  assert.ok(results.some((r) => r.kind === "video_audio" && r.state === "unavailable"));
  assert.equal((await call(`/api/media/${video.id}/assets/standard`, ids.bob)).status, 404);
  assert.equal((await call(`/api/media/${video.id}/assets/standard`, ids.alice)).status, 200);
  assert.equal((await call(`/api/media/${video.id}`, ids.alice)).status, 404);
});
test("full independent audited review is revision-bound and cannot waive malware", async () => {
  const video = await processVideo(false);
  assert.equal((await call(`/api/media/${video.id}/captions`, ids.alice, { method: "PATCH", body: captions })).status, 409);
  assert.equal((await call("/api/staff/video-review", ids.bob, { headers: { "x-stale": "1" } })).status, 403);
  const reviewed = await call(`/api/staff/video-review/${video.id}/decision`, ids.bob, { method: "POST", body: {
    decision: "allow", reason: "Cannot waive incomplete malware scanning", captionVersion: 0, watchedEntireVideo: true, listenedEntireAudio: true } });
  assert.equal(reviewed.status, 409);
  assert.equal((await db.select().from(mediaVariantsTable).where(eq(mediaVariantsTable.assetId, video.id))).length, 0);
  assert.equal((await call(`/api/media/${video.id}/assets/standard`, ids.alice)).status, 404);
  process.env.MEDIA_TEST_PROVIDER = "allow";
  await db.update(videoJobsTable).set({ leaseUntil: null }).where(eq(videoJobsTable.assetId, video.id));
  assert.equal(await runVideoJobOnce(), true);
  assert.equal((await call(`/api/media/${video.id}/captions`, ids.alice, { method: "PATCH", body: captions })).status, 200);
  assert.equal((await approve(video.id, ids.alice)).status, 403);
  assert.equal((await approve(video.id)).body.status, "ready");
  assert.equal((await call(`/api/media/${video.id}/captions`, ids.alice, { method: "PATCH", body: captions })).status, 409);
});
test("every playback variant retains audience and live block authority; captions invalidate approval; delete cleans all objects", async () => {
  const video = await processVideo();
  await call(`/api/media/${video.id}/captions`, ids.alice, { method: "PATCH", body: captions });
  const approved = await approve(video.id);
  assert.equal(approved.body.status, "ready", JSON.stringify(approved.body));
  const postId = randomUUID();
  await db.insert(postsTable).values({ id: postId, authorMemberId: ids.alice, status: "published", body: "Hello", audience: "friends", mediaAssetIds: [video.id], publishedAt: new Date() });
  const [left, right] = [ids.alice, ids.bob].sort();
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId: left, memberBId: right });
  for (const variant of ["standard", "low", "webm", "thumbnail", "captions", "transcript"]) {
    assert.equal((await call(`/api/media/${video.id}/assets/${variant}`)).status, 401);
    assert.equal((await call(`/api/media/${video.id}/assets/${variant}`, ids.carol)).status, 404);
    assert.equal((await call(`/api/media/${video.id}/assets/${variant}`, ids.bob)).status, 200);
  }
  const range = await call(`/api/media/${video.id}/assets/low`, ids.bob, { headers: { range: "bytes=0-15" } });
  assert.equal(range.status, 206); assert.match(range.headers.get("content-range")!, /^bytes 0-15\//);
  assert.equal((await call("/api/reels", ids.bob)).body.items.length, 1);
  await db.insert(safetyRelationshipsTable).values({ id: randomUUID(), actorMemberId: ids.bob, targetMemberId: ids.alice, kind: "block" });
  for (const variant of ["standard", "low", "webm", "thumbnail", "captions", "transcript"]) assert.equal((await call(`/api/media/${video.id}/assets/${variant}`, ids.bob)).status, 404);
  assert.equal((await call("/api/reels", ids.bob)).body.items.length, 0);
  const corrected = await call(`/api/media/${video.id}/captions`, ids.alice, { method: "PATCH", body: { ...captions, captionVersion: 1 } });
  assert.equal(corrected.body.status, "held");
  assert.equal((await approve(video.id, ids.bob, 1)).status, 409);
  assert.equal((await call(`/api/posts/${postId}`, ids.alice, { method: "DELETE" })).status, 204);
  await cleanupExpiredMedia();
  assert.equal((await call(`/api/media/${video.id}/assets/standard`, ids.alice)).status, 404);
  assert.equal([...objects.values()].every((o) => o.deleted), true);
  assert.equal((await db.select().from(videoJobsTable).where(eq(videoJobsTable.assetId, video.id))).length, 0);
  assert.equal((await db.select().from(mediaCleanupTasksTable).where(eq(mediaCleanupTasksTable.assetId, video.id))).length, 1);
});
test("interrupted uploads can be recovered, invalid byte counts cannot complete, cancellation removes bytes", async () => {
  const video = await upload();
  assert.equal((await call(`/api/media/uploads/${video.id}/retry`, ids.alice, { method: "POST" })).status, 200);
  objects.set(video.path, { bytes: Buffer.from("not matching size") });
  assert.equal((await call(`/api/media/uploads/${video.id}/complete`, ids.alice, { method: "POST" })).status, 409);
  assert.equal((await call(`/api/media/${video.id}/status`, ids.bob)).status, 404);
  assert.equal((await call(`/api/media/uploads/${video.id}/cancel`, ids.alice, { method: "POST" })).status, 204);
  assert.equal(objects.get(video.path)?.deleted, true);
});
