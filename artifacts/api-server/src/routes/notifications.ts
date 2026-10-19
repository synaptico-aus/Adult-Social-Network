import { Router, type Request } from "express";
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import {
  db, deviceRegistrationsTable,
  notificationDeliveryQueueTable, notificationEventsTable, notificationPreferencesTable, notificationsTable, membersTable, postsTable, safetyRelationshipsTable,
  conversationMembersTable, conversationsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/account-auth";
import { visiblePost } from "./posts";
import { liveConversationMember } from "../lib/conversation-access";
import { lockGroupAuthority } from "../lib/member-locks";
import { inQuietHours, validQuietTime } from "../lib/quiet-hours";

const router = Router();
router.use(["/notifications", "/notification-preferences", "/devices", "/delivery"], requireAuth);
const memberFor = async (req: Request) => {
  const userId = getAuth(req).userId;
  return userId ? (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, userId)).limit(1))[0] : undefined;
};
type NotificationSourceCursor = { at: Date; id: string } | null;
type NotificationCursor = { modern: NotificationSourceCursor; legacy: NotificationSourceCursor };
const cursor = (value: NotificationCursor) => Buffer.from(JSON.stringify({
  modern: value.modern && { at: value.modern.at.toISOString(), id: value.modern.id },
  legacy: value.legacy && { at: value.legacy.at.toISOString(), id: value.legacy.id },
}), "utf8").toString("base64url");
function parseCursor(raw: unknown): NotificationCursor | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const x = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const parseSource = (value: any): NotificationSourceCursor | undefined => {
      if (value === null || value === undefined) return null;
      const at = new Date(value.at);
      return typeof value.id === "string" && !Number.isNaN(at.valueOf()) ? { at, id: value.id } : undefined;
    };
    // Accept cursors issued by the previous single-source implementation.
    if (x.modern === undefined && x.legacy === undefined) {
      const source = parseSource(x);
      return source === undefined ? undefined : { modern: source, legacy: source };
    }
    const modern = parseSource(x.modern);
    const legacy = parseSource(x.legacy);
    return modern === undefined || legacy === undefined ? undefined : { modern, legacy };
  } catch { return undefined; }
}
async function blocked(a: string, b: string) {
  return !!(await db.select({ id: safetyRelationshipsTable.id }).from(safetyRelationshipsTable).where(and(eq(safetyRelationshipsTable.kind, "block"), or(
    and(eq(safetyRelationshipsTable.actorMemberId, a), eq(safetyRelationshipsTable.targetMemberId, b)),
    and(eq(safetyRelationshipsTable.actorMemberId, b), eq(safetyRelationshipsTable.targetMemberId, a)),
  ))).limit(1))[0];
}
async function visibleNotification(row: typeof notificationsTable.$inferSelect, memberId: string) {
  if (row.actorMemberId && await blocked(row.actorMemberId, memberId)) return false;
  if (row.postId) {
    const post = (await db.select().from(postsTable).where(eq(postsTable.id, row.postId)).limit(1))[0];
    if (!post || !(await visiblePost(post, memberId))) return false;
  }
  if (row.conversationId) {
    const conversation = (await db.select({ id: conversationsTable.id }).from(conversationsTable).where(and(eq(conversationsTable.id, row.conversationId), eq(conversationsTable.status, "active"))).limit(1))[0];
    const membership = conversation && await liveConversationMember(conversation.id, memberId);
    if (!conversation || !membership) return false;
    const participants = await db.select({ memberId: conversationMembersTable.memberId }).from(conversationMembersTable).where(and(eq(conversationMembersTable.conversationId, conversation.id), eq(conversationMembersTable.status, "active")));
    for (const participant of participants) if (participant.memberId !== memberId && await blocked(participant.memberId, memberId)) return false;
  }
  return true;
}
const preferenceInput = z.object({
  inAppMessages: z.boolean().optional(), browserMessages: z.boolean().optional(), nativeMessages: z.boolean().optional(),
  inAppRequests: z.boolean().optional(), browserRequests: z.boolean().optional(), nativeRequests: z.boolean().optional(),
  inAppGroupActivity: z.boolean().optional(), browserGroupActivity: z.boolean().optional(), nativeGroupActivity: z.boolean().optional(),
  inAppSafety: z.boolean().optional(), browserSafety: z.boolean().optional(), nativeSafety: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(), quietHoursStart: z.string().refine(validQuietTime).nullable().optional(),
  quietHoursEnd: z.string().refine(validQuietTime).nullable().optional(), quietHoursTimezone: z.string().nullable().optional(),
  lockScreenPreview: z.enum(["private", "generic", "off"]).optional(),
}).strict();
function validTimezone(value: string | null | undefined) {
  if (!value) return true;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
}

router.get("/notifications", async (req, res): Promise<void> => {
  const member = await memberFor(req); if (!member) { res.status(401).end(); return; }
  const parsed = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().optional() }).safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid pagination" }); return; }
  const c = parseCursor(parsed.data.cursor);
  if (parsed.data.cursor && !c) { res.status(400).json({ error: "Invalid cursor" }); return; }
  const limit = parsed.data.limit;
  const memberId = member.id;
  const start = c ?? { modern: null, legacy: null };
  type Candidate = { source: "modern" | "legacy"; item: any };
  async function scanSource(source: "modern" | "legacy", startCursor: NotificationSourceCursor): Promise<{ candidates: Candidate[]; exhausted: boolean }> {
    const candidates: Candidate[] = [];
    let sourceCursor = startCursor;
    let exhausted = false;
    while (candidates.length <= limit && !exhausted) {
      const condition = sourceCursor
        ? or(lt(source === "modern" ? notificationsTable.createdAt : notificationEventsTable.createdAt, sourceCursor.at), and(
          eq(source === "modern" ? notificationsTable.createdAt : notificationEventsTable.createdAt, sourceCursor.at),
          lt(source === "modern" ? notificationsTable.id : notificationEventsTable.id, sourceCursor.id),
        ))
        : undefined;
      if (source === "modern") {
        const rows = await db.select().from(notificationsTable).where(and(eq(notificationsTable.recipientMemberId, memberId), condition)).orderBy(desc(notificationsTable.createdAt), desc(notificationsTable.id)).limit(100);
        if (!rows.length) { exhausted = true; continue; }
        for (const row of rows) {
          sourceCursor = { at: row.createdAt, id: row.id };
          if (await visibleNotification(row, memberId)) candidates.push({ source, item: row });
          if (candidates.length > limit) break;
        }
        if (rows.length < 100) exhausted = true;
      } else {
        const rows = await db.select().from(notificationEventsTable).where(and(eq(notificationEventsTable.recipientMemberId, memberId), condition)).orderBy(desc(notificationEventsTable.createdAt), desc(notificationEventsTable.id)).limit(100);
        if (!rows.length) { exhausted = true; continue; }
        for (const event of rows) {
          sourceCursor = { at: event.createdAt, id: event.id };
          if (event.actorMemberId && await blocked(event.actorMemberId, memberId)) continue;
          if (event.postId) {
            const post = (await db.select().from(postsTable).where(eq(postsTable.id, event.postId)).limit(1))[0];
            if (!post || !(await visiblePost(post, memberId))) continue;
          }
          candidates.push({ source, item: {
            id: event.id, recipientMemberId: event.recipientMemberId, actorMemberId: event.actorMemberId,
            kind: "post" as const, title: "New activity", body: "You have new activity",
            deepLink: null, conversationId: null, messageId: null, postId: event.postId,
            dedupKey: `legacy:${event.id}`, createdAt: event.createdAt, readAt: event.deliveredAt,
          } });
          if (candidates.length > limit) break;
        }
        if (rows.length < 100) exhausted = true;
      }
    }
    return { candidates, exhausted };
  }
  const [modern, legacy] = await Promise.all([scanSource("modern", start.modern), scanSource("legacy", start.legacy)]);
  const combined = [...modern.candidates, ...legacy.candidates].sort((a, b) => b.item.createdAt.valueOf() - a.item.createdAt.valueOf() || b.item.id.localeCompare(a.item.id));
  const page = combined.slice(0, limit);
  const lastReturned = page.at(-1)?.item;
  if (!lastReturned) { res.json({ items: [], nextCursor: null }); return; }
  const next: NotificationCursor = { modern: start.modern, legacy: start.legacy };
  for (const source of ["modern", "legacy"] as const) {
    const returned = page.filter((candidate) => candidate.source === source).at(-1)?.item;
    next[source] = returned ? { at: returned.createdAt, id: returned.id } : { at: lastReturned.createdAt, id: lastReturned.id };
  }
  const hasUnreturned = combined.length > page.length || !modern.exhausted || !legacy.exhausted;
  res.json({ items: page.map((candidate) => candidate.item), nextCursor: hasUnreturned ? cursor(next) : null });
});
router.get("/notifications/unread-count", async (req, res): Promise<void> => {
  const member = await memberFor(req); if (!member) { res.status(401).end(); return; }
  const rows = await db.select().from(notificationsTable).where(and(eq(notificationsTable.recipientMemberId, member.id), isNull(notificationsTable.readAt)));
  let count = 0; for (const row of rows) if (await visibleNotification(row, member.id)) count++;
  res.json({ count });
});
router.post("/notifications/:id/read", async (req, res): Promise<void> => {
  const member = await memberFor(req); if (!member) { res.status(401).end(); return; }
  const [row] = await db.update(notificationsTable).set({ readAt: sql`coalesce(${notificationsTable.readAt}, now())` }).where(and(eq(notificationsTable.id, String(req.params.id)), eq(notificationsTable.recipientMemberId, member.id))).returning();
  if (!row || !(await visibleNotification(row, member.id))) { res.status(404).json({ error: "Notification not found" }); return; }
  res.json(row);
});
router.post("/notifications/read-all", async (req, res): Promise<void> => {
  const member = await memberFor(req); if (!member) { res.status(401).end(); return; }
  await db.update(notificationsTable).set({ readAt: sql`coalesce(${notificationsTable.readAt}, now())` }).where(and(eq(notificationsTable.recipientMemberId, member.id), isNull(notificationsTable.readAt)));
  res.json({ updated: true });
});

router.get("/notification-preferences", async (req, res): Promise<void> => {
  const member = await memberFor(req); if (!member) { res.status(401).end(); return; }
  const row = (await db.select().from(notificationPreferencesTable).where(eq(notificationPreferencesTable.memberId, member.id)).limit(1))[0];
  res.json(row ?? { memberId: member.id, inAppMessages: true, browserMessages: true, nativeMessages: true, inAppRequests: true, browserRequests: true, nativeRequests: true, inAppGroupActivity: true, browserGroupActivity: true, nativeGroupActivity: true, inAppSafety: true, browserSafety: true, nativeSafety: true, quietHoursEnabled: false, quietHoursStart: null, quietHoursEnd: null, quietHoursTimezone: null, lockScreenPreview: "generic" });
});
router.patch("/notification-preferences", async (req, res): Promise<void> => {
  const member = await memberFor(req); const parsed = preferenceInput.safeParse(req.body);
  if (!member || !parsed.success || !validTimezone(parsed.data.quietHoursTimezone)) { res.status(400).json({ error: "Invalid notification preferences or IANA timezone" }); return; }
  const previous = (await db.select().from(notificationPreferencesTable).where(eq(notificationPreferencesTable.memberId, member.id)).limit(1))[0];
  const merged = { ...previous, ...parsed.data };
  if (merged.quietHoursEnabled && (!merged.quietHoursStart || !merged.quietHoursEnd || !merged.quietHoursTimezone)) { res.status(400).json({ error: "Quiet hours require start, end, and timezone" }); return; }
  const [row] = await db.insert(notificationPreferencesTable).values({ memberId: member.id, ...parsed.data }).onConflictDoUpdate({ target: notificationPreferencesTable.memberId, set: { ...parsed.data, updatedAt: new Date() } }).returning();
  res.json(row);
});

const deviceInput = z.object({ kind: z.enum(["browser_push", "native_push"]), tokenOrEndpoint: z.string().trim().min(1).max(4096), platform: z.string().trim().min(1).max(64), accountSessionDeviceId: z.string().trim().min(1).max(256), expiresAt: z.coerce.date().nullable().optional() }).strict();
function publicDevice(row: typeof deviceRegistrationsTable.$inferSelect) {
  return { id: row.id, kind: row.kind, platform: row.platform, accountSessionDeviceId: row.accountSessionDeviceId, expiresAt: row.expiresAt, lastSeenAt: row.lastSeenAt, active: row.active };
}
router.post("/devices", async (req, res): Promise<void> => {
  const member = await memberFor(req); const parsed = deviceInput.safeParse(req.body);
  if (!member || !parsed.success) { res.status(400).json({ error: "Invalid device registration" }); return; }
  const sessionId = getAuth(req).sessionId;
  if (!sessionId) { res.status(401).json({ error: "A verified Clerk session is required" }); return; }
  if (parsed.data.expiresAt && parsed.data.expiresAt <= new Date()) { res.status(400).json({ error: "Device registration is already expired" }); return; }
  const existing = (await db.select().from(deviceRegistrationsTable).where(and(eq(deviceRegistrationsTable.memberId, member.id), eq(deviceRegistrationsTable.tokenOrEndpoint, parsed.data.tokenOrEndpoint))).limit(1))[0];
  const owner = existing ?? (await db.select().from(deviceRegistrationsTable).where(eq(deviceRegistrationsTable.tokenOrEndpoint, parsed.data.tokenOrEndpoint)).limit(1))[0];
  if (owner && owner.memberId !== member.id) { res.status(409).json({ error: "Device token is already registered" }); return; }
  let row;
  try {
    row = existing
      ? (await db.update(deviceRegistrationsTable).set({ ...parsed.data, clerkSessionId: sessionId, active: true, revokedAt: null, lastSeenAt: new Date() }).where(eq(deviceRegistrationsTable.id, existing.id)).returning())[0]
      : (await db.insert(deviceRegistrationsTable).values({ id: randomUUID(), memberId: member.id, clerkSessionId: sessionId, ...parsed.data }).returning())[0];
  } catch {
    res.status(409).json({ error: "Device token is already registered" }); return;
  }
  res.status(existing ? 200 : 201).json(publicDevice(row));
});
router.delete("/devices/current", async (req, res): Promise<void> => {
  const member = await memberFor(req); if (!member) { res.status(401).end(); return; }
  const sessionId = getAuth(req).sessionId;
  if (!sessionId) { res.status(400).json({ error: "Current session is unavailable" }); return; }
  await db.update(deviceRegistrationsTable).set({ active: false, revokedAt: new Date() }).where(and(eq(deviceRegistrationsTable.memberId, member.id), eq(deviceRegistrationsTable.clerkSessionId, sessionId)));
  res.sendStatus(204);
});
router.delete("/devices/all", async (req, res): Promise<void> => {
  const member = await memberFor(req); if (!member) { res.status(401).end(); return; }
  await db.update(deviceRegistrationsTable).set({ active: false, revokedAt: new Date() }).where(eq(deviceRegistrationsTable.memberId, member.id));
  res.sendStatus(204);
});

router.get("/delivery/status", async (_req, res): Promise<void> => {
  // No credentials or external delivery services are configured in this deployment.
  res.json({
    native: { configured: false, realDeliveryVerified: false, status: "incomplete", reason: "No APNs or FCM provider credentials/services are configured" },
    browser: { configured: false, realDeliveryVerified: false, status: "incomplete", reason: "No VAPID/Web Push provider credentials/services are configured" },
  });
});

/** Internal-safe helper for routes/background workers; payload is intentionally absent. */
export async function enqueueNotification(input: {
  recipientMemberId: string; actorMemberId?: string | null; kind: "message" | "request" | "group_activity" | "safety" | "post" | "system";
  title: string; body: string; deepLink?: string | null; conversationId?: string | null; messageId?: string | null; postId?: string | null; dedupKey: string;
}) {
  return db.transaction(async (tx) => {
    if (input.conversationId) {
      const conversation = (await tx.select({ groupId: conversationsTable.groupId }).from(conversationsTable).where(eq(conversationsTable.id, input.conversationId)).limit(1))[0];
      if (conversation?.groupId) await lockGroupAuthority(tx, conversation.groupId);
      const live = await liveConversationMember(input.conversationId, input.recipientMemberId, tx);
      if (!live) return undefined;
    }
    const [notification] = await tx.insert(notificationsTable).values({ id: randomUUID(), ...input }).onConflictDoNothing().returning();
    if (!notification) return undefined;
    const prefs = (await tx.select().from(notificationPreferencesTable).where(eq(notificationPreferencesTable.memberId, input.recipientMemberId)).limit(1))[0];
    const registrations = await tx.select().from(deviceRegistrationsTable).where(and(eq(deviceRegistrationsTable.memberId, input.recipientMemberId), eq(deviceRegistrationsTable.active, true), or(isNull(deviceRegistrationsTable.expiresAt), gt(deviceRegistrationsTable.expiresAt, new Date()))));
    await tx.update(deviceRegistrationsTable).set({ active: false, revokedAt: sql`now()` }).where(and(eq(deviceRegistrationsTable.memberId, input.recipientMemberId), eq(deviceRegistrationsTable.active, true), lt(deviceRegistrationsTable.expiresAt, new Date())));
    const quiet = prefs ? inQuietHours(prefs) : false;
    for (const registration of registrations) {
      const category = input.kind === "message" ? "Messages" : input.kind === "request" ? "Requests" : input.kind === "group_activity" ? "GroupActivity" : "Safety";
      const channel = registration.kind === "browser_push" ? "browser" : "native";
      const enabled = !prefs || (prefs as any)[`${channel}${category}`] !== false;
      if (!enabled) continue;
      await tx.insert(notificationDeliveryQueueTable).values({
        id: randomUUID(), notificationId: notification.id, registrationId: registration.id, dedupKey: input.dedupKey,
        status: quiet ? "suppressed_quiet_hours" : "blocked_unconfigured", attempts: 0,
        lastErrorCode: quiet ? "quiet_hours" : "provider_unconfigured",
      }).onConflictDoNothing();
    }
    return notification;
  });
}

export async function revokeDevicesForClerkSession(sessionId: string) {
  await db.update(deviceRegistrationsTable).set({ active: false, revokedAt: new Date() }).where(eq(deviceRegistrationsTable.clerkSessionId, sessionId));
}

export default router;