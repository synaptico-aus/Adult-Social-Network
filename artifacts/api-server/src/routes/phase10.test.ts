import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { createApp } from "../app.ts";
import { resetRateLimitBuckets } from "../middlewares/account-auth.ts";
import {
  db, pool, membersTable, friendshipsTable, conversationsTable, conversationMembersTable,
  messagesTable, messageRequestsTable, notificationDeliveryQueueTable, deviceRegistrationsTable,
  notificationsTable, notificationEventsTable, mediaAssetsTable, messageMediaAttachmentsTable, messageMemberRemovalsTable,
  messageReportsTable, messageReportContextTable, reportsTable, staffRoleAssignmentsTable,
  evidenceAccessAuditTable, notificationPreferencesTable, groupsTable, groupMembersTable, safetyRelationshipsTable,
  profilesTable,
} from "@workspace/db";
import { enqueueNotification } from "./notifications.ts";
import { configureTestMediaStorage } from "../lib/media-storage.ts";

const ids = { alice: `phase10-alice-${randomUUID()}`, bob: `phase10-bob-${randomUUID()}`, stranger: `phase10-stranger-${randomUUID()}`, staff: `phase10-staff-${randomUUID()}` };
const app = createApp({ authMiddleware: (req, _res, next) => {
  const userId = req.header("x-test-user") ?? null;
  const fresh = req.header("x-test-mfa") === "fresh";
  const sessionId = req.header("x-test-no-session") === "1" ? null : (req.header("x-test-session") ?? (userId ? `test-session-${userId}` : null));
  Object.assign(req, { auth: Object.assign(() => ({ userId, sessionId, tokenType: "session_token", sessionClaims: { fva: [fresh ? 1 : null, fresh ? 1 : 6] } }), { [Symbol.for("@clerk/express.auth")]: true }) });
  next();
} });
let server: ReturnType<typeof app.listen>; let base = "";
async function call(path: string, user: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const response = await fetch(`${base}${path}`, { method: options.method ?? "GET", headers: { "x-test-user": user, ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...options.headers }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  return { status: response.status, body: await response.json().catch(() => undefined) as any };
}
before(async () => {
  server = app.listen(0); await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.NODE_ENV = "test";
  configureTestMediaStorage(new Map());
  await db.insert(membersTable).values(Object.values(ids).map((id) => ({ id, clerkUserId: id, emailVerified: true })));
  await db.insert(staffRoleAssignmentsTable).values({ id: randomUUID(), clerkUserId: ids.staff, role: "moderator", capabilities: ["evidence.read"], active: true });
});
beforeEach(async () => {
  process.env.PHASE6_TEST = "1"; resetRateLimitBuckets();
  await db.delete(messageReportsTable).where(eq(messageReportsTable.reporterMemberId, ids.alice));
  await db.delete(messageReportContextTable).where(eq(messageReportContextTable.senderMemberId, ids.alice));
  await db.delete(evidenceAccessAuditTable).where(eq(evidenceAccessAuditTable.actorClerkUserId, ids.staff));
  await db.delete(reportsTable).where(eq(reportsTable.reporterMemberId, ids.alice));
  await db.delete(notificationsTable).where(eq(notificationsTable.recipientMemberId, ids.alice));
  await db.delete(safetyRelationshipsTable).where(or(
    inArray(safetyRelationshipsTable.actorMemberId, Object.values(ids)),
    inArray(safetyRelationshipsTable.targetMemberId, Object.values(ids)),
  ));
  await db.delete(deviceRegistrationsTable).where(inArray(deviceRegistrationsTable.memberId, [ids.alice, ids.bob, ids.stranger]));
  await db.delete(messageRequestsTable).where(inArray(messageRequestsTable.memberAId, [ids.alice, ids.bob, ids.stranger]));
  await db.delete(conversationsTable).where(inArray(conversationsTable.createdByMemberId, [ids.alice, ids.bob, ids.stranger]));
  await db.delete(friendshipsTable).where(inArray(friendshipsTable.memberAId, [ids.alice, ids.bob, ids.stranger]));
});
after(async () => {
  await db.delete(staffRoleAssignmentsTable).where(eq(staffRoleAssignmentsTable.clerkUserId, ids.staff));
  await db.delete(membersTable).where(inArray(membersTable.id, Object.values(ids)));
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
});

test("friends get direct access while stranger contact policy creates recipient-bound request", async () => {
  await db.insert(profilesTable).values([
    { id: randomUUID(), memberId: ids.alice, preferredName: "Alice", discoverable: true, visibility: { preferredName: "members" } },
    { id: randomUUID(), memberId: ids.bob, preferredName: "Bob", discoverable: true, visibility: { preferredName: "members" } },
    { id: randomUUID(), memberId: ids.stranger, preferredName: "Stranger", discoverable: true, visibility: { preferredName: "members" } },
  ]);
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId: ids.alice < ids.bob ? ids.alice : ids.bob, memberBId: ids.alice < ids.bob ? ids.bob : ids.alice });
  const direct = await call("/api/conversations/direct", ids.alice, { method: "POST", body: { recipientMemberId: ids.bob, body: "hello" } });
  assert.equal(direct.status, 201);
  assert.equal(direct.body.conversation.displayTitle, "Bob");
  assert.equal(direct.body.conversation.participants.find((row: any) => row.memberId === ids.bob).displayName, "Bob");
  assert.equal(direct.body.message.senderDisplayName, "Alice");
  assert.equal((await call(`/api/conversations/${direct.body.conversation.id}`, ids.stranger)).status, 404);
  assert.equal((await call("/api/conversations", ids.alice)).body.items[0].displayTitle, "Bob");
  const denied = await call("/api/conversations/direct", ids.alice, { method: "POST", body: { recipientMemberId: ids.stranger, body: "hello" } });
  assert.equal(denied.status, 403);
  assert.equal((await call("/api/message-contact-settings", ids.stranger, { method: "PATCH", body: { setting: "any_member_requests" } })).status, 200);
  const requested = await call("/api/conversations/direct", ids.alice, { method: "POST", body: { recipientMemberId: ids.stranger, body: "request" } });
  assert.equal(requested.status, 202);
  assert.equal(requested.body.request.recipientMemberId, ids.stranger);
  assert.equal(requested.body.request.senderDisplayName, "Alice");
  assert.equal(requested.body.request.recipientDisplayName, "Stranger");
  assert.equal((await call(`/api/message-requests/${requested.body.request.id}/accept`, ids.alice, { method: "POST" })).status, 404);
  assert.equal((await call(`/api/message-requests/${requested.body.request.id}/accept`, ids.stranger, { method: "POST" })).status, 200);
});

test("message idempotency returns exactly one message and pagination is stable", async () => {
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId: ids.alice < ids.bob ? ids.alice : ids.bob, memberBId: ids.alice < ids.bob ? ids.bob : ids.alice });
  const created = await call("/api/conversations/direct", ids.alice, { method: "POST", body: { recipientMemberId: ids.bob, body: "first" } });
  const id = created.body.conversation.id; const key = `retry-${randomUUID()}`;
  const one = await call(`/api/conversations/${id}/messages`, ids.alice, { method: "POST", body: { body: "retry", idempotencyKey: key } });
  const two = await call(`/api/conversations/${id}/messages`, ids.alice, { method: "POST", body: { body: "retry changed", idempotencyKey: key } });
  assert.equal(one.status, 201); assert.equal(two.status, 201); assert.equal(one.body.id, two.body.id);
  const rows = await db.select().from(messagesTable).where(eq(messagesTable.conversationId, id));
  assert.equal(rows.filter((row) => row.id === one.body.id).length, 1);
  const page = await call(`/api/conversations/${id}/messages?limit=1`, ids.bob);
  assert.equal(page.status, 200); assert.equal(page.body.items.length, 1);
});

test("notification registration is account-bound and unconfigured delivery remains explicit", async () => {
  const registration = await call("/api/devices", ids.alice, { method: "POST", body: { kind: "native_push", tokenOrEndpoint: `opaque-${randomUUID()}`, platform: "test", accountSessionDeviceId: "device-a" } });
   assert.equal(registration.status, 201); assert.equal("token" in registration.body, false);
  const notification = await enqueueNotification({ recipientMemberId: ids.alice, kind: "system", title: "Activity", body: "You have new activity", dedupKey: `dedup-${randomUUID()}` });
  assert.ok(notification);
  const queue = await db.select().from(notificationDeliveryQueueTable).where(eq(notificationDeliveryQueueTable.notificationId, notification!.id));
  assert.equal(queue[0]?.status, "blocked_unconfigured");
  const status = await call("/api/delivery/status", ids.alice);
  assert.equal(status.body.native.configured, false); assert.equal(status.body.native.realDeliveryVerified, false);
   assert.equal((await call("/api/devices/current", ids.alice, { method: "DELETE" })).status, 204);
});

test("blocking immediately revokes direct request, conversation reads, sends, and races", async () => {
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId: ids.alice, memberBId: ids.bob });
  const created = await call("/api/conversations/direct", ids.alice, { method: "POST", body: { recipientMemberId: ids.bob, body: "before block" } });
  assert.equal(created.status, 201);
  await Promise.all([
    call("/api/safety/block", ids.alice, { method: "POST", body: { targetMemberId: ids.bob } }),
    call(`/api/conversations/${created.body.conversation.id}/messages`, ids.bob, { method: "POST", body: { body: "race", idempotencyKey: randomUUID() } }),
  ]);
  assert.equal((await call(`/api/conversations/${created.body.conversation.id}`, ids.bob)).status, 404);
  assert.equal((await call(`/api/conversations/${created.body.conversation.id}/messages`, ids.bob)).status, 404);
  assert.notEqual((await call("/api/conversations/direct", ids.bob, { method: "POST", body: { recipientMemberId: ids.alice, body: "after block" } })).status, 201);
  assert.equal((await db.select().from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, created.body.conversation.id), eq(conversationMembersTable.status, "active")))).length, 0);
  await call("/api/message-contact-settings", ids.stranger, { method: "PATCH", body: { setting: "any_member_requests" } });
  const request = await call("/api/conversations/direct", ids.alice, { method: "POST", body: { recipientMemberId: ids.stranger, body: "pending" } });
  assert.equal(request.status, 202);
  const [accepted, blockedRequest] = await Promise.all([
    call(`/api/message-requests/${request.body.request.id}/accept`, ids.stranger, { method: "POST" }),
    call("/api/safety/block", ids.stranger, { method: "POST", body: { targetMemberId: ids.alice } }),
  ]);
  assert.ok([200, 404].includes(accepted.status));
  assert.ok([200, 201].includes(blockedRequest.status));
  const finalRequest = (await db.select().from(messageRequestsTable).where(eq(messageRequestsTable.id, request.body.request.id)))[0];
  assert.ok(finalRequest && ["accepted", "cancelled"].includes(finalRequest.status));
  assert.notEqual(finalRequest?.status, "pending");
  if (accepted.status === 200) {
    const conversationId = accepted.body.conversation.id;
    assert.equal((await call(`/api/conversations/${conversationId}`, ids.alice)).status, 404);
    assert.equal((await call(`/api/conversations/${conversationId}`, ids.stranger)).status, 404);
    assert.equal((await call(`/api/conversations/${conversationId}/messages`, ids.alice)).status, 404);
    assert.equal((await db.select().from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, conversationId), eq(conversationMembersTable.status, "active")))).length, 0);
  }
});

test("repeated accept/block races remain privacy-safe and leave no active authority", async () => {
  for (let i = 0; i < 20; i++) {
    const sender = `phase10-race-sender-${randomUUID()}`;
    const recipient = `phase10-race-recipient-${randomUUID()}`;
    await db.insert(membersTable).values([
      { id: sender, clerkUserId: sender, emailVerified: true },
      { id: recipient, clerkUserId: recipient, emailVerified: true },
    ]);
    assert.equal((await call("/api/message-contact-settings", recipient, { method: "PATCH", body: { setting: "any_member_requests" } })).status, 200);
    const request = await call("/api/conversations/direct", sender, { method: "POST", body: { recipientMemberId: recipient, body: `race-${i}` } });
    assert.equal(request.status, 202);
    const [accepted, blockedRequest] = await Promise.all([
      call(`/api/message-requests/${request.body.request.id}/accept`, recipient, { method: "POST" }),
      call("/api/safety/block", recipient, { method: "POST", body: { targetMemberId: sender } }),
    ]);
    assert.ok([200, 404].includes(accepted.status));
    assert.ok([200, 201].includes(blockedRequest.status));
    const finalRequest = (await db.select().from(messageRequestsTable).where(eq(messageRequestsTable.id, request.body.request.id)))[0];
    assert.ok(finalRequest && ["accepted", "cancelled"].includes(finalRequest.status));
    assert.notEqual(finalRequest?.status, "pending");
    const conversations = await db.select({ id: conversationsTable.id }).from(conversationsTable).where(and(eq(conversationsTable.memberAId, sender < recipient ? sender : recipient), eq(conversationsTable.memberBId, sender < recipient ? recipient : sender)));
    for (const conversation of conversations) {
      assert.equal((await db.select().from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, conversation.id), eq(conversationMembersTable.status, "active")))).length, 0);
    }
  }
});

test("group owner-safe removal, leave/close lifecycle, and rejoin cutoff", async () => {
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId: ids.alice, memberBId: ids.bob });
  const group = await call("/api/conversations/group", ids.alice, { method: "POST", body: { memberIds: [ids.bob], title: "Test group" } });
  assert.equal(group.status, 201);
  assert.equal(group.body.displayTitle, "Test group");
  assert.equal(group.body.participantCount, 2);
  const old = await call(`/api/conversations/${group.body.id}/messages`, ids.alice, { method: "POST", body: { body: "old", idempotencyKey: randomUUID() } });
  assert.equal(old.status, 201);
  assert.equal((await call(`/api/conversations/${group.body.id}/participants/${ids.bob}`, ids.alice, { method: "DELETE" })).status, 200);
  assert.equal((await call(`/api/conversations/${group.body.id}/messages`, ids.bob)).status, 404);
  assert.equal((await call(`/api/conversations/${group.body.id}/participants`, ids.alice, { method: "POST", body: { memberId: ids.bob } })).status, 201);
  const afterRejoin = await call(`/api/conversations/${group.body.id}/messages`, ids.bob);
  assert.equal(afterRejoin.status, 200);
  assert.equal(afterRejoin.body.items.some((row: any) => row.id === old.body.id), false);
  assert.equal((await call(`/api/conversations/${group.body.id}/leave`, ids.alice, { method: "POST", body: {} })).status, 409);
  assert.equal((await call(`/api/conversations/${group.body.id}/leave`, ids.alice, { method: "POST", body: { transferToMemberId: ids.bob } })).status, 200);
  assert.equal((await call(`/api/conversations/${group.body.id}/close`, ids.bob, { method: "POST" })).status, 200);
  assert.equal((await call(`/api/conversations/${group.body.id}`, ids.bob)).status, 404);
  const shared = await call("/api/conversations/group", ids.alice, { method: "POST", body: { memberIds: [ids.bob], title: "Shared group" } });
  await call("/api/safety/block", ids.alice, { method: "POST", body: { targetMemberId: ids.bob } });
  assert.equal((await call(`/api/conversations/${shared.body.id}`, ids.bob)).status, 404);
  assert.equal((await db.select().from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, shared.body.id), eq(conversationMembersTable.memberId, ids.alice), eq(conversationMembersTable.status, "active")))).length, 1);
});

test("linked group conversations require live group membership and hide history after group rejoin", async () => {
  const groupId = randomUUID();
  const [memberAId, memberBId] = ids.alice < ids.bob ? [ids.alice, ids.bob] : [ids.bob, ids.alice];
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId, memberBId });
  await db.insert(groupsTable).values({ id: groupId, ownerMemberId: ids.alice, name: "Linked", category: "interests" });
  await db.insert(groupMembersTable).values([
    { id: randomUUID(), groupId, memberId: ids.alice, role: "owner" },
    { id: randomUUID(), groupId, memberId: ids.bob, role: "member" },
  ]);
  const linked = await call("/api/conversations/group", ids.alice, { method: "POST", body: { memberIds: [ids.bob], groupId, title: "Linked conversation" } });
  assert.equal(linked.status, 201);
  assert.equal((await call(`/api/conversations/${linked.body.id}`, ids.bob)).status, 200);
  const old = await call(`/api/conversations/${linked.body.id}/messages`, ids.alice, { method: "POST", body: { body: "before removal", idempotencyKey: randomUUID() } });
  assert.equal(old.status, 201);
  const [removedByApi, racedSend] = await Promise.all([
    call(`/api/conversations/${linked.body.id}/participants/${ids.bob}`, ids.alice, { method: "DELETE" }),
    call(`/api/conversations/${linked.body.id}/messages`, ids.bob, { method: "POST", body: { body: "raced", idempotencyKey: randomUUID() } }),
  ]);
  assert.equal(removedByApi.status, 200);
  assert.ok([201, 404].includes(racedSend.status));
  assert.equal((await call(`/api/conversations/${linked.body.id}`, ids.bob)).status, 404);
  assert.equal((await db.select().from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, linked.body.id), eq(conversationMembersTable.memberId, ids.bob), eq(conversationMembersTable.status, "active")))).length, 0);
  if (racedSend.status === 201) {
    assert.equal((await db.select().from(notificationsTable).where(and(eq(notificationsTable.recipientMemberId, ids.bob), eq(notificationsTable.messageId, racedSend.body.id)))).length, 0);
  }
  assert.equal((await call(`/api/conversations/${linked.body.id}/participants`, ids.alice, { method: "POST", body: { memberId: ids.bob } })).status, 201);
  const linkedAsset = (await db.insert(mediaAssetsTable).values({ id: randomUUID(), ownerMemberId: ids.alice, kind: "photo", objectPath: `linked/${randomUUID()}`, clientIdempotencyKey: randomUUID(), requestedContentType: "image/png", contentType: "image/png", status: "ready", malwareState: "allowed", abuseState: "allowed", expiresAt: new Date(Date.now() + 86_400_000) }).returning())[0];
  configureTestMediaStorage(new Map([[linkedAsset.objectPath, { bytes: Buffer.from("linked"), contentType: "image/png" }]]));
  const linkedMedia = await call(`/api/conversations/${linked.body.id}/messages`, ids.alice, { method: "POST", body: { mediaAssetIds: [linkedAsset.id], idempotencyKey: randomUUID() } });
  assert.equal(linkedMedia.status, 201);
  assert.equal((await call(`/api/media/${linkedAsset.id}`, ids.bob)).status, 200);
  assert.equal((await call("/api/profile/export", ids.bob)).body.conversations.some((row: any) => row.id === linked.body.id), true);
  const [bobLeave, leaveRacedSend] = await Promise.all([
    call(`/api/groups/${groupId}/leave`, ids.bob, { method: "POST" }),
    call(`/api/conversations/${linked.body.id}/messages`, ids.alice, { method: "POST", body: { body: "raced with group leave", idempotencyKey: randomUUID() } }),
  ]);
  assert.equal(bobLeave.status, 200);
  assert.equal(leaveRacedSend.status, 201);
  assert.equal((await db.select().from(notificationsTable).where(and(eq(notificationsTable.recipientMemberId, ids.bob), eq(notificationsTable.conversationId, linked.body.id)))).length, 0);
  assert.equal((await call(`/api/groups/${groupId}/join`, ids.bob, { method: "POST" })).status, 200);
  const [groupRemoval, groupRacedSend] = await Promise.all([
    call(`/api/groups/${groupId}/members/${ids.bob}`, ids.alice, { method: "DELETE" }),
    call(`/api/conversations/${linked.body.id}/messages`, ids.alice, { method: "POST", body: { body: "raced with group removal", idempotencyKey: randomUUID() } }),
  ]);
  assert.equal(groupRemoval.status, 204);
  assert.equal(groupRacedSend.status, 201);
  assert.equal((await db.select().from(notificationsTable).where(and(eq(notificationsTable.recipientMemberId, ids.bob), eq(notificationsTable.conversationId, linked.body.id)))).length, 0);
  assert.equal((await db.select({ id: notificationDeliveryQueueTable.id }).from(notificationDeliveryQueueTable).innerJoin(notificationsTable, eq(notificationDeliveryQueueTable.notificationId, notificationsTable.id)).where(and(eq(notificationsTable.recipientMemberId, ids.bob), eq(notificationsTable.conversationId, linked.body.id)))).length, 0);
  assert.equal((await call("/api/conversations", ids.bob)).body.items.some((row: any) => row.id === linked.body.id), false);
  assert.equal((await call(`/api/conversations/${linked.body.id}`, ids.bob)).status, 404);
  assert.equal((await call(`/api/conversations/${linked.body.id}/messages`, ids.bob)).status, 404);
  assert.equal((await call(`/api/media/${linkedAsset.id}`, ids.bob)).status, 404);
  assert.equal((await call("/api/profile/export", ids.bob)).body.conversations.some((row: any) => row.id === linked.body.id), false);
  assert.equal((await call(`/api/conversations/${linked.body.id}/messages`, ids.bob, { method: "POST", body: { body: "revoked", idempotencyKey: randomUUID() } })).status, 404);
  assert.equal((await call(`/api/groups/${groupId}/join`, ids.bob, { method: "POST" })).status, 200);
  const after = await call(`/api/conversations/${linked.body.id}/messages`, ids.alice, { method: "POST", body: { body: "after rejoin", idempotencyKey: randomUUID() } });
  const bobHistory = await call(`/api/conversations/${linked.body.id}/messages`, ids.bob);
  assert.equal(bobHistory.status, 200);
  assert.equal(bobHistory.body.items.some((row: any) => row.id === old.body.id), false);
  assert.equal(bobHistory.body.items.some((row: any) => row.id === after.body.id), true);
});

test("protected ready photo/audio only can be attached and message media is reauthorized", async () => {
  const expiresAt = new Date(Date.now() + 86_400_000);
  const assets = await db.insert(mediaAssetsTable).values([
    { id: randomUUID(), ownerMemberId: ids.alice, kind: "photo", objectPath: `phase10/${randomUUID()}`, clientIdempotencyKey: randomUUID(), requestedContentType: "image/png", contentType: "image/png", status: "ready", malwareState: "allowed", abuseState: "allowed", expiresAt },
    { id: randomUUID(), ownerMemberId: ids.alice, kind: "audio", objectPath: `phase10/${randomUUID()}`, clientIdempotencyKey: randomUUID(), requestedContentType: "audio/mpeg", contentType: "audio/mpeg", status: "ready", malwareState: "allowed", abuseState: "allowed", transcript: "voice", durationSeconds: 2, expiresAt },
    { id: randomUUID(), ownerMemberId: ids.alice, kind: "photo", objectPath: `phase10/${randomUUID()}`, clientIdempotencyKey: randomUUID(), requestedContentType: "image/png", status: "held", malwareState: "unavailable", abuseState: "unavailable", expiresAt },
    { id: randomUUID(), ownerMemberId: ids.alice, kind: "audio", objectPath: `phase10/${randomUUID()}`, clientIdempotencyKey: randomUUID(), requestedContentType: "audio/mpeg", status: "rejected", malwareState: "blocked", abuseState: "blocked", expiresAt },
  ]).returning();
  const unowned = randomUUID();
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId: ids.alice, memberBId: ids.bob });
  const conversation = await call("/api/conversations/direct", ids.alice, { method: "POST", body: { recipientMemberId: ids.bob, body: "media" } });
  const ready = await call(`/api/conversations/${conversation.body.conversation.id}/messages`, ids.alice, { method: "POST", body: { mediaAssetIds: assets.slice(0, 2).map((x) => x.id), idempotencyKey: randomUUID() } });
  assert.equal(ready.status, 201);
  assert.equal(ready.body.mediaAssets[0].status, "ready");
  assert.equal(ready.body.mediaAssets[0].kind, "photo");
  const mediaObjects = new Map<string, { bytes: Buffer; contentType: string }>();
  mediaObjects.set(assets[0].objectPath, { bytes: Buffer.from("photo"), contentType: "image/png" });
  mediaObjects.set(assets[1].objectPath, { bytes: Buffer.from("audio"), contentType: "audio/mpeg" });
  configureTestMediaStorage(mediaObjects);
  assert.equal((await call(`/api/conversations/${conversation.body.conversation.id}/messages`, ids.alice, { method: "POST", body: { mediaAssetIds: [assets[2].id], idempotencyKey: randomUUID() } })).status, 409);
  assert.equal((await call(`/api/conversations/${conversation.body.conversation.id}/messages`, ids.alice, { method: "POST", body: { mediaAssetIds: [unowned], idempotencyKey: randomUUID() } })).status, 409);
  assert.equal((await call(`/api/media/${assets[0].id}`, ids.bob)).status, 200);
  await call("/api/safety/block", ids.alice, { method: "POST", body: { targetMemberId: ids.bob } });
  assert.equal((await call(`/api/media/${assets[0].id}`, ids.bob)).status, 404);
});

test("for-me tombstones are private while for-everyone deletion is visible to another member", async () => {
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId: ids.alice, memberBId: ids.bob });
  const conversation = await call("/api/conversations/direct", ids.alice, { method: "POST", body: { recipientMemberId: ids.bob, body: "seed" } });
  const sent = await call(`/api/conversations/${conversation.body.conversation.id}/messages`, ids.alice, { method: "POST", body: { body: "private removal", idempotencyKey: randomUUID() } });
  assert.equal((await call(`/api/messages/${sent.body.id}/for-me`, ids.bob, { method: "DELETE" })).status, 204);
  assert.equal((await call(`/api/conversations/${conversation.body.conversation.id}/messages`, ids.bob)).body.items.some((row: any) => row.id === sent.body.id), false);
  assert.equal((await call(`/api/conversations/${conversation.body.conversation.id}/messages`, ids.alice)).body.items.some((row: any) => row.id === sent.body.id), true);
  const everyone = await call(`/api/conversations/${conversation.body.conversation.id}/messages`, ids.alice, { method: "POST", body: { body: "everyone removal", idempotencyKey: randomUUID() } });
  assert.equal((await call(`/api/messages/${everyone.body.id}/for-everyone`, ids.alice, { method: "DELETE" })).status, 200);
  const bobView = await call(`/api/conversations/${conversation.body.conversation.id}/messages`, ids.bob);
  const deleted = bobView.body.items.find((row: any) => row.id === everyone.body.id);
  assert.equal(deleted.deletedForEveryone, true); assert.equal(deleted.body, null);
});

test("message report is exact-report scoped, MFA/capability gated, audited, and bounded", async () => {
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId: ids.alice, memberBId: ids.bob });
  const conversation = await call("/api/conversations/direct", ids.bob, { method: "POST", body: { recipientMemberId: ids.alice, body: "reportable" } });
  const report = await call(`/api/messages/${conversation.body.message.id}/report`, ids.alice, { method: "POST", body: { category: "harassment", details: "specific" } });
  assert.equal(report.status, 201);
  assert.equal((await call(`/api/staff/reports/${report.body.report.id}/message-evidence`, ids.staff)).status, 403);
  assert.equal((await call(`/api/staff/reports/${report.body.report.id}/message-evidence`, ids.staff, { method: "GET", headers: { "x-test-mfa": "fresh" } })).status, 400);
  const evidence = await call(`/api/staff/reports/${report.body.report.id}/message-evidence?reason=review`, ids.staff, { headers: { "x-test-mfa": "fresh" } });
  assert.equal(evidence.status, 200);
  assert.ok(evidence.body.context.length <= 5);
  assert.equal((await db.select().from(evidenceAccessAuditTable).where(eq(evidenceAccessAuditTable.evidenceId, report.body.evidenceId))).length, 1);
  assert.equal((await call(`/api/staff/reports/${randomUUID()}/message-evidence?reason=review`, ids.staff, { method: "GET", headers: { "x-test-mfa": "fresh" } })).status, 404);
});

test("notification pagination merges legacy and modern rows and scans hidden rows without a cap", async () => {
  const now = Date.now();
  await db.insert(notificationsTable).values(Array.from({ length: 15 }, (_, i) => ({
    id: randomUUID(), recipientMemberId: ids.alice, kind: "system" as const, title: "Modern", body: `modern-${i}`,
    dedupKey: `pagination-modern-${i}-${randomUUID()}`, createdAt: new Date(now - i * 1_000),
  })));
  await db.insert(notificationEventsTable).values(Array.from({ length: 15 }, (_, i) => ({
    id: randomUUID(), recipientMemberId: ids.alice, eventType: "legacy", moderationState: "pending",
    createdAt: new Date(now - (i + 20) * 1_000),
  })));
  const first = await call("/api/notifications?limit=10", ids.alice);
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 10);
  assert.ok(first.body.nextCursor);
  const second = await call(`/api/notifications?limit=10&cursor=${encodeURIComponent(first.body.nextCursor)}`, ids.alice);
  assert.equal(second.status, 200);
  assert.equal(second.body.items.length, 10);
  const third = await call(`/api/notifications?limit=10&cursor=${encodeURIComponent(second.body.nextCursor)}`, ids.alice);
  assert.equal(third.status, 200);
  assert.equal(third.body.items.length, 10);
  assert.equal(third.body.nextCursor, null);

  await db.delete(notificationEventsTable).where(eq(notificationEventsTable.recipientMemberId, ids.alice));
  await db.delete(notificationsTable).where(eq(notificationsTable.recipientMemberId, ids.alice));
  await db.insert(safetyRelationshipsTable).values({ id: randomUUID(), actorMemberId: ids.bob, targetMemberId: ids.alice, kind: "block" });
  await db.insert(notificationsTable).values(Array.from({ length: 120 }, (_, i) => ({
    id: randomUUID(), recipientMemberId: ids.alice, actorMemberId: ids.bob, kind: "system" as const, title: "Hidden", body: "hidden",
    dedupKey: `pagination-hidden-${i}-${randomUUID()}`, createdAt: new Date(now + 100_000 - i * 1_000),
  })));
  await db.insert(notificationsTable).values(Array.from({ length: 11 }, (_, i) => ({
    id: randomUUID(), recipientMemberId: ids.alice, kind: "system" as const, title: "Visible", body: `visible-${i}`,
    dedupKey: `pagination-visible-${i}-${randomUUID()}`, createdAt: new Date(now - 100_000 - i * 1_000),
  })));
  const hiddenScan = await call("/api/notifications?limit=10", ids.alice);
  assert.equal(hiddenScan.status, 200);
  assert.equal(hiddenScan.body.items.length, 10);
  assert.equal(hiddenScan.body.items.every((item: any) => item.title === "Visible"), true);
  assert.ok(hiddenScan.body.nextCursor);
});

test("notification dedup/read/unread/preferences/quiet hours and inaccessible deep links are suppressed", async () => {
  await call("/api/devices", ids.alice, { method: "POST", body: { kind: "native_push", tokenOrEndpoint: `notify-${randomUUID()}`, platform: "test", accountSessionDeviceId: "notify-device" } });
  const dedup = `phase10-dedup-${randomUUID()}`;
  const first = await enqueueNotification({ recipientMemberId: ids.alice, kind: "system", title: "New activity", body: "You have new activity", dedupKey: dedup });
  const second = await enqueueNotification({ recipientMemberId: ids.alice, kind: "system", title: "New activity", body: "You have new activity", dedupKey: dedup });
  assert.ok(first); assert.equal(second, undefined);
  assert.equal((await call("/api/notifications/unread-count", ids.alice)).body.count >= 1, true);
  assert.equal((await call(`/api/notifications/${first!.id}/read`, ids.alice, { method: "POST" })).status, 200);
  assert.equal((await call("/api/notification-preferences", ids.alice, { method: "PATCH", body: { quietHoursEnabled: true, quietHoursStart: "00:00", quietHoursEnd: "00:00", quietHoursTimezone: "UTC", browserMessages: false } })).status, 200);
  const quiet = await enqueueNotification({ recipientMemberId: ids.alice, kind: "message", title: "New activity", body: "You have new activity", dedupKey: `quiet-${randomUUID()}` });
  const queue = await db.select().from(notificationDeliveryQueueTable).where(eq(notificationDeliveryQueueTable.notificationId, quiet!.id));
  assert.equal(queue[0]?.status, "suppressed_quiet_hours");
  const inaccessible = await enqueueNotification({ recipientMemberId: ids.alice, kind: "message", title: "New activity", body: "You have new activity", conversationId: randomUUID(), deepLink: "/messages", dedupKey: `hidden-${randomUUID()}` });
  const inbox = await call("/api/notifications", ids.alice);
  assert.ok(Array.isArray(inbox.body.items));
  assert.equal(inaccessible, undefined);
  assert.ok("nextCursor" in inbox.body);
});

test("device rotation, expiry, account binding, logout/all revoke, and generic queue records", async () => {
  const token = `token-${randomUUID()}`;
  assert.equal((await call("/api/devices", ids.alice, { method: "POST", headers: { "x-test-no-session": "1" }, body: { kind: "browser_push", tokenOrEndpoint: `missing-${randomUUID()}`, platform: "test", accountSessionDeviceId: "missing" } })).status, 401);
  const registered = await call("/api/devices", ids.alice, { method: "POST", body: { kind: "browser_push", tokenOrEndpoint: token, platform: "test", accountSessionDeviceId: "device-rotate" } });
  assert.equal(registered.status, 201);
  assert.equal((await call("/api/devices", ids.bob, { method: "POST", body: { kind: "browser_push", tokenOrEndpoint: token, platform: "test", accountSessionDeviceId: "bob-device" } })).status, 409);
  const rotated = await call("/api/devices", ids.alice, { method: "POST", body: { kind: "browser_push", tokenOrEndpoint: token, platform: "test2", accountSessionDeviceId: "device-rotate" } });
  assert.equal(rotated.status, 200); assert.equal("token" in rotated.body, false);
  assert.equal((await call("/api/devices/current", ids.alice, { method: "DELETE" })).status, 204);
  assert.equal((await db.select().from(deviceRegistrationsTable).where(and(eq(deviceRegistrationsTable.memberId, ids.alice), eq(deviceRegistrationsTable.active, true)))).length, 0);
  assert.equal((await call("/api/devices/all", ids.alice, { method: "DELETE" })).status, 204);
  assert.equal((await db.select().from(deviceRegistrationsTable).where(and(eq(deviceRegistrationsTable.memberId, ids.alice), eq(deviceRegistrationsTable.active, true)))).length, 0);
  const generic = await enqueueNotification({ recipientMemberId: ids.alice, kind: "system", title: "private sender should never be pushed", body: "secret message body", dedupKey: `payload-${randomUUID()}` });
  const queued = await db.select().from(notificationDeliveryQueueTable).where(eq(notificationDeliveryQueueTable.notificationId, generic!.id));
  assert.ok(queued.every((row) => !("payload" in row)));
  const expired = await call("/api/devices", ids.alice, { method: "POST", body: { kind: "native_push", tokenOrEndpoint: `expired-${randomUUID()}`, platform: "test", accountSessionDeviceId: "expired", expiresAt: new Date(Date.now() - 1000).toISOString() } });
  assert.equal(expired.status, 400);
});

test("export and deletion remain account-isolated and revoke active authority", async () => {
  await db.insert(friendshipsTable).values({ id: randomUUID(), memberAId: ids.alice, memberBId: ids.bob });
  const conversation = await call("/api/conversations/direct", ids.alice, { method: "POST", body: { recipientMemberId: ids.bob, body: "isolated" } });
  const aliceExport = await call("/api/profile/export", ids.alice);
  const bobExport = await call("/api/profile/export", ids.bob);
  assert.equal(aliceExport.status, 200); assert.equal(bobExport.status, 200);
  assert.equal(aliceExport.body.conversations.some((row: any) => row.id === conversation.body.conversation.id), true);
  assert.equal(bobExport.body.conversations.some((row: any) => row.id === conversation.body.conversation.id), true);
  assert.equal((await call("/api/account/deletion", ids.alice, { method: "POST", body: {}, headers: { "x-test-mfa": "fresh" } })).status, 202);
  assert.equal((await call("/api/conversations", ids.alice)).status, 403);
  assert.equal((await call("/api/conversations", ids.bob)).status, 200);
  assert.equal((await db.select().from(deviceRegistrationsTable).where(and(eq(deviceRegistrationsTable.memberId, ids.alice), eq(deviceRegistrationsTable.active, true)))).length, 0);
});