import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { circleHistoryGrantsTable, circleInvitationsTable, circleMembersTable, circlesTable, db, membersTable, notificationEventsTable, postsTable, safetyRelationshipsTable, pool } from "@workspace/db";
import { createApp } from "../app.ts";
import { resetRateLimitBuckets } from "../middlewares/account-auth.ts";

const ids = { alice: `phase8-alice-${randomUUID()}`, bob: `phase8-bob-${randomUUID()}`, carol: `phase8-carol-${randomUUID()}` };
const app = createApp({ authMiddleware: (req, _res, next) => { const userId = req.header("x-test-user") ?? null; Object.assign(req, { auth: Object.assign(() => ({ userId, tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true }) }); next(); } });
let server: ReturnType<typeof app.listen>; let base = "";
async function call(path: string, user: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${base}${path}`, { method: options.method ?? "GET", headers: { "x-test-user": user, ...(options.body === undefined ? {} : { "content-type": "application/json" }) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  return { status: response.status, body: await response.json().catch(() => undefined) as any };
}
const future = () => new Date(Date.now() + 86_400_000).toISOString();
before(async () => { server = app.listen(0); await new Promise<void>((resolve) => server.once("listening", resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`; await db.insert(membersTable).values(Object.values(ids).map((id) => ({ id, clerkUserId: id, emailVerified: true }))); });
beforeEach(async () => {
  process.env.PHASE6_TEST = "1"; resetRateLimitBuckets();
  await db.delete(notificationEventsTable).where(or(inArray(notificationEventsTable.actorMemberId, Object.values(ids)), inArray(notificationEventsTable.recipientMemberId, Object.values(ids))));
  await db.delete(circlesTable).where(eq(circlesTable.ownerMemberId, ids.alice));
  await db.delete(safetyRelationshipsTable).where(or(inArray(safetyRelationshipsTable.actorMemberId, Object.values(ids)), inArray(safetyRelationshipsTable.targetMemberId, Object.values(ids))));
});
after(async () => { await db.delete(circlesTable).where(eq(circlesTable.ownerMemberId, ids.alice)); await db.delete(membersTable).where(inArray(membersTable.id, Object.values(ids))); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await pool.end(); });

async function circle() {
  const created = await call("/api/circles", ids.alice, { method: "POST", body: { name: "Family circle" } }); assert.equal(created.status, 201); return created.body;
}
async function inviteAndAccept(circleId: string, recipient = ids.bob) {
  const invitation = await call(`/api/circles/${circleId}/invitations`, ids.alice, { method: "POST", body: { recipientMemberId: recipient, expiresAt: future() } }); assert.equal(invitation.status, 201);
  const accepted = await call(`/api/circle-invitations/${invitation.body.id}/accept`, recipient, { method: "POST" }); assert.equal(accepted.status, 200); return invitation.body;
}

test("invitations expire, accept once only, and cannot be accepted by another member", async () => {
  const created = await circle();
  const invite = await call(`/api/circles/${created.id}/invitations`, ids.alice, { method: "POST", body: { recipientMemberId: ids.bob, expiresAt: future() } });
  assert.equal((await call(`/api/circle-invitations/${invite.body.id}/accept`, ids.carol, { method: "POST" })).status, 404);
  assert.equal((await call(`/api/circle-invitations/${invite.body.id}/accept`, ids.bob, { method: "POST" })).status, 200);
  assert.equal((await call(`/api/circle-invitations/${invite.body.id}/accept`, ids.bob, { method: "POST" })).status, 404);
  const expiring = await call(`/api/circles/${created.id}/invitations`, ids.alice, { method: "POST", body: { recipientMemberId: ids.carol, expiresAt: future() } });
  await db.update(circleInvitationsTable).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(circleInvitationsTable.id, expiring.body.id));
  assert.equal((await call(`/api/circle-invitations/${expiring.body.id}/accept`, ids.carol, { method: "POST" })).status, 404);
});

test("new members need an explicit history grant and removal revokes posts, comments, links and notifications", async () => {
  const created = await circle();
  const made = await call("/api/posts", ids.alice, { method: "POST", body: { body: "earlier private update", audience: "my_circle", circleId: created.id } }); assert.equal(made.status, 201);
  assert.equal((await call(`/api/posts/${made.body.id}/publish`, ids.alice, { method: "POST" })).status, 200);
  await db.update(postsTable).set({ createdAt: new Date(Date.now() - 86_400_000), publishedAt: new Date(Date.now() - 86_400_000) }).where(eq(postsTable.id, made.body.id));
  await inviteAndAccept(created.id);
  assert.equal((await call(`/api/posts/${made.body.id}`, ids.bob)).status, 404);
  assert.equal((await call(`/api/circles/${created.id}/history-access`, ids.alice, { method: "POST", body: { memberId: ids.bob } })).status, 204);
  assert.equal((await call(`/api/posts/${made.body.id}`, ids.bob)).status, 200);
  assert.equal((await call(`/api/circles/${created.id}/history-access/${ids.bob}`, ids.alice, { method: "DELETE" })).status, 204);
  assert.equal((await call(`/api/posts/${made.body.id}`, ids.bob)).status, 404);
  await call(`/api/circles/${created.id}/history-access`, ids.alice, { method: "POST", body: { memberId: ids.bob } });
  const bobPost = await call("/api/posts", ids.bob, { method: "POST", body: { body: "my own circle update", audience: "my_circle", circleId: created.id } }); assert.equal(bobPost.status, 201);
  assert.equal((await call(`/api/posts/${bobPost.body.id}/publish`, ids.bob, { method: "POST" })).status, 200);
  assert.equal((await call(`/api/circles/${created.id}/members/${ids.bob}`, ids.alice, { method: "DELETE" })).status, 204);
  assert.equal((await call(`/api/posts/${made.body.id}`, ids.bob)).status, 404);
  assert.equal((await call(`/api/posts/${bobPost.body.id}`, ids.bob)).status, 404);
  assert.equal((await call(`/api/posts/${made.body.id}/comments`, ids.bob, { method: "POST", body: { body: "no access" } })).status, 404);
  assert.equal((await call("/api/notifications", ids.bob)).body.some((event: any) => event.postId === made.body.id), false);
  await inviteAndAccept(created.id);
  assert.equal((await call(`/api/posts/${made.body.id}`, ids.bob)).status, 404);
});

test("blocks prevent invitations and immediately remove the blocker from a shared circle", async () => {
  const created = await circle();
  await inviteAndAccept(created.id);
  assert.equal((await call("/api/safety/block", ids.bob, { method: "POST", body: { targetMemberId: ids.alice } })).status, 201);
  assert.equal((await call(`/api/circles/${created.id}`, ids.bob)).status, 404);
  const another = await circle();
  assert.equal((await call("/api/safety/block", ids.alice, { method: "POST", body: { targetMemberId: ids.carol } })).status, 201);
  assert.equal((await call(`/api/circles/${another.id}/invitations`, ids.alice, { method: "POST", body: { recipientMemberId: ids.carol, expiresAt: future() } })).status, 404);
});

test("closing a circle immediately hides it and every circle post from every member", async () => {
  const created = await circle(); await inviteAndAccept(created.id);
  const post = await call("/api/posts", ids.bob, { method: "POST", body: { body: "circle update", audience: "my_circle", circleId: created.id } }); assert.equal(post.status, 201);
  assert.equal((await call(`/api/posts/${post.body.id}/publish`, ids.bob, { method: "POST" })).status, 200);
  assert.equal((await call(`/api/circles/${created.id}`, ids.alice, { method: "DELETE" })).status, 204);
  assert.equal((await call(`/api/circles/${created.id}`, ids.alice)).status, 404);
  assert.equal((await call(`/api/circles/${created.id}`, ids.bob)).status, 404);
  assert.equal((await call(`/api/posts/${post.body.id}`, ids.bob)).status, 404);
});