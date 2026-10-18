import { Router, type Request, type Response, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, membersTable, memoryCollectionsTable, memoryItemsTable, memoryReminderPreferencesTable, hiddenMemoriesTable,
  postsTable, mediaAssetsTable, resourcesTable, circlesTable, circleMembersTable, type MemoryCollection, type MemoryItem } from "@workspace/db";
import { CreateMemoryCollectionBody, UpdateMemoryCollectionBody, AddMemoryItemBody, UpdateMemoryItemBody,
  ReorderMemoryItemsBody, HideMemoryItemBody, SetMemoryReminderPreferencesBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/account-auth";
import { canUseGroup } from "../lib/group-access";
import { intakeForModeration } from "../lib/moderation-intake";
import { canViewCollection, collectionOutput, resolveMemory, collectionDetail, sourceKey, visibleCollections } from "../lib/memory-access";
import "../lib/memories-deletion-hook";

const router: IRouter = Router();
router.use(["/memory-collections", "/memory-sources", "/memory-reminder-preferences", "/memory-reminders"], requireAuth);
class MemoryError extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, message: string): never => { throw new MemoryError(status, message); };
type Context = { req: Request; res: Response; memberId: string };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
function route(fn: (context: Context) => Promise<void>) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const [member] = await db.select().from(membersTable).where(eq(membersTable.clerkUserId, getAuth(req).userId ?? "")).limit(1);
      if (!member) { res.status(404).json({ error: "Member not found" }); return; }
      res.set("Cache-Control", "private, no-store");
      await fn({ req, res, memberId: member.id });
    } catch (error) {
      if (error instanceof MemoryError) res.status(error.status).json({ error: error.message });
      else { req.log?.error({ err: error }, "Memory collection operation failed"); res.status(500).json({ error: "Memory collection operation failed" }); }
    }
  };
}
async function readCollection(id: string, viewer: string) {
  const [collection] = await db.select().from(memoryCollectionsTable).where(eq(memoryCollectionsTable.id, id)).limit(1);
  if (!collection || !(await canViewCollection(collection, viewer))) fail(404, "Collection unavailable");
  return collection!;
}
async function owned(tx: Tx, id: string, memberId: string) {
  const [collection] = await tx.select().from(memoryCollectionsTable).where(and(eq(memoryCollectionsTable.id, id), eq(memoryCollectionsTable.ownerMemberId, memberId))).for("update");
  if (!collection) fail(404, "Collection unavailable");
  return collection!;
}
async function screen(tx: Tx, collection: MemoryCollection) {
  const items = await tx.select().from(memoryItemsTable).where(eq(memoryItemsTable.collectionId, collection.id));
  const record = await intakeForModeration({ contentId: collection.id, subjectMemberId: collection.ownerMemberId,
    text: [collection.name, ...items.map((item) => item.caption)].join("\n"), executor: tx });
  const [updated] = await tx.update(memoryCollectionsTable).set({ updatedAt: sql`CURRENT_TIMESTAMP`, sharingHeld: record.state !== "allowed",
    revision: sql`${memoryCollectionsTable.revision} + 1` }).where(eq(memoryCollectionsTable.id, collection.id)).returning();
  return updated;
}
async function checkScope(collection: Pick<MemoryCollection, "audience" | "circleId" | "groupId">, memberId: string) {
  if (collection.audience === "my_circle") {
    const [membership] = await db.select().from(circleMembersTable).innerJoin(circlesTable, eq(circlesTable.id, circleMembersTable.circleId))
      .where(and(eq(circleMembersTable.circleId, collection.circleId ?? ""), eq(circleMembersTable.memberId, memberId),
        eq(circleMembersTable.status, "active"), eq(circlesTable.status, "active"))).limit(1);
    if (!membership) fail(404, "Circle unavailable");
  }
  if (collection.audience === "this_group" && !(await canUseGroup(collection.groupId, memberId))) fail(404, "Group unavailable");
}
router.get("/memory-collections", route(async ({ memberId, res }) => {
  res.json(await Promise.all((await visibleCollections(memberId)).map((collection) => collectionOutput(collection, memberId))));
}));
router.post("/memory-collections", route(async ({ req, res, memberId }) => {
  const parsed = CreateMemoryCollectionBody.strict().safeParse(req.body);
  if (!parsed.success || !parsed.data.name?.trim()) fail(400, "A collection name is required");
  const data = parsed.data!, audience = data.audience ?? "only_me";
  if (audience !== "only_me" && data.shareConsent !== true) fail(400, "Confirm deliberate sharing");
  const scope = { audience, circleId: audience === "my_circle" ? data.circleId ?? null : null, groupId: audience === "this_group" ? data.groupId ?? null : null };
  await checkScope(scope, memberId);
  const collection = await db.transaction(async (tx) => {
    const [created] = await tx.insert(memoryCollectionsTable).values({ id: randomUUID(), ownerMemberId: memberId, name: data.name!.trim(), ...scope }).returning();
    return screen(tx, created);
  });
  res.status(201).json(await collectionOutput(collection, memberId));
}));
router.get("/memory-collections/:id", route(async ({ req, res, memberId }) => {
  const detail = await collectionDetail(await readCollection(String(req.params.id), memberId), memberId);
  if (!detail) fail(409, "Collection changed; reload to check current access");
  res.json(detail);
}));
router.patch("/memory-collections/:id", route(async ({ req, res, memberId }) => {
  const parsed = UpdateMemoryCollectionBody.strict().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length || parsed.data.name !== undefined && !parsed.data.name.trim()) fail(400, "Invalid collection");
  const data = parsed.data!;
  const collection = await db.transaction(async (tx) => {
    const current = await owned(tx, String(req.params.id), memberId);
    const audience = data.audience ?? current.audience;
    const scope = { audience, circleId: audience === "my_circle" ? data.circleId === undefined ? current.circleId : data.circleId : null,
      groupId: audience === "this_group" ? data.groupId === undefined ? current.groupId : data.groupId : null };
    const changed = scope.audience !== current.audience || scope.circleId !== current.circleId || scope.groupId !== current.groupId;
    if (changed && audience !== "only_me" && data.shareConsent !== true) fail(400, "Confirm deliberate sharing");
    await checkScope(scope, memberId);
    const [updated] = await tx.update(memoryCollectionsTable).set({ ...scope, name: data.name?.trim() ?? current.name,
      sharedAt: changed ? sql`CURRENT_TIMESTAMP` : current.sharedAt }).where(eq(memoryCollectionsTable.id, current.id)).returning();
    return screen(tx, updated);
  });
  res.json(await collectionOutput(collection, memberId));
}));
router.delete("/memory-collections/:id", route(async ({ req, res, memberId }) => {
  await db.transaction(async (tx) => {
    const collection = await owned(tx, String(req.params.id), memberId);
    await tx.delete(memoryCollectionsTable).where(eq(memoryCollectionsTable.id, collection.id));
  }); res.status(204).end();
}));
router.post("/memory-collections/:id/items", route(async ({ req, res, memberId }) => {
  const parsed = AddMemoryItemBody.strict().safeParse(req.body);
  if (!parsed.success) fail(400, "Invalid memory reference");
  const data = parsed.data!;
  const result = await db.transaction(async (tx) => {
    const collection = await owned(tx, String(req.params.id), memberId);
    const items = await tx.select().from(memoryItemsTable).where(eq(memoryItemsTable.collectionId, collection.id));
    if (items.length >= 200) fail(409, "This collection has reached its 200 memory limit");
    const item: MemoryItem = { id: randomUUID(), collectionId: collection.id, kind: data.kind,
      sourceId: data.sourceId, sourcePostId: data.kind === "post" ? data.sourceId : data.kind === "music" ? null : data.sourcePostId ?? null, caption: data.caption?.trim() ?? "",
      position: Math.max(-1, ...items.map((existing) => existing.position)) + 1, createdAt: new Date() };
    if ((await resolveMemory(item, memberId, memberId)).unavailable) fail(404, "Source unavailable or hidden; restore it before adding");
    if (items.some((existing) => sourceKey(existing) === sourceKey(item) && existing.sourcePostId === item.sourcePostId)) fail(409, "Memory already in this collection");
    await tx.insert(memoryItemsTable).values(item); await screen(tx, collection);
    return resolveMemory(item, memberId, memberId);
  }); res.status(201).json(result);
}));
router.patch("/memory-collections/:id/items/:itemId", route(async ({ req, res, memberId }) => {
  const parsed = UpdateMemoryItemBody.strict().safeParse(req.body);
  if (!parsed.success) fail(400, "Invalid caption");
  const result = await db.transaction(async (tx) => {
    const collection = await owned(tx, String(req.params.id), memberId);
    const [item] = await tx.update(memoryItemsTable).set({ caption: parsed.data!.caption.trim() })
      .where(and(eq(memoryItemsTable.id, String(req.params.itemId)), eq(memoryItemsTable.collectionId, collection.id))).returning();
    if (!item) fail(404, "Memory unavailable");
    await screen(tx, collection); return resolveMemory(item!, memberId, memberId);
  }); res.json(result);
}));
router.delete("/memory-collections/:id/items/:itemId", route(async ({ req, res, memberId }) => {
  await db.transaction(async (tx) => {
    const collection = await owned(tx, String(req.params.id), memberId);
    await tx.delete(memoryItemsTable).where(and(eq(memoryItemsTable.id, String(req.params.itemId)), eq(memoryItemsTable.collectionId, collection.id)));
    await screen(tx, collection);
  }); res.status(204).end();
}));
router.put("/memory-collections/:id/order", route(async ({ req, res, memberId }) => {
  const parsed = ReorderMemoryItemsBody.strict().safeParse(req.body);
  if (!parsed.success) fail(400, "Invalid memory order");
  const ids = parsed.data!.itemIds;
  await db.transaction(async (tx) => {
    const collection = await owned(tx, String(req.params.id), memberId);
    const items = await tx.select().from(memoryItemsTable).where(eq(memoryItemsTable.collectionId, collection.id));
    if (ids.length !== items.length || new Set(ids).size !== ids.length || items.some((item) => !ids.includes(item.id))) fail(409, "Order must include every current memory exactly once");
    for (const [position, id] of ids.entries()) await tx.update(memoryItemsTable).set({ position }).where(and(eq(memoryItemsTable.id, id), eq(memoryItemsTable.collectionId, collection.id)));
    await tx.update(memoryCollectionsTable).set({ updatedAt: sql`CURRENT_TIMESTAMP`, revision: sql`${memoryCollectionsTable.revision} + 1` }).where(eq(memoryCollectionsTable.id, collection.id));
  }); res.status(204).end();
}));
router.post("/memory-collections/:id/items/:itemId/hide", route(async ({ req, res, memberId }) => {
  const parsed = HideMemoryItemBody.strict().safeParse(req.body);
  if (!parsed.success) fail(400, "Invalid hide preference");
  const collection = await readCollection(String(req.params.id), memberId);
  const [item] = await db.select().from(memoryItemsTable).where(and(eq(memoryItemsTable.id, String(req.params.itemId)), eq(memoryItemsTable.collectionId, collection.id))).limit(1);
  if (!item) fail(404, "Memory unavailable");
  if (parsed.data!.hidden) await db.insert(hiddenMemoriesTable).values({ id: randomUUID(), memberId, sourceKey: sourceKey(item!) }).onConflictDoNothing();
  else await db.delete(hiddenMemoriesTable).where(and(eq(hiddenMemoriesTable.memberId, memberId), eq(hiddenMemoriesTable.sourceKey, sourceKey(item!))));
  res.status(204).end();
}));
router.get("/memory-collections/:id/export", route(async ({ req, res, memberId }) => {
  const collection = await readCollection(String(req.params.id), memberId);
  if (collection.ownerMemberId !== memberId) fail(403, "Only the collection owner can export it");
  const detail = await collectionDetail(collection, memberId, true);
  if (!detail) fail(409, "Collection changed; retry export");
  res.set("Content-Disposition", 'attachment; filename="memory-collection.json"').json(detail);
}));
router.get("/memory-sources", route(async ({ res, memberId }) => {
  const posts = await db.select().from(postsTable).where(eq(postsTable.status, "published")).orderBy(desc(postsTable.createdAt)).limit(100);
  const candidates: MemoryItem[] = [];
  for (const post of posts) {
    candidates.push({ id: `post:${post.id}`, collectionId: "", kind: "post", sourceId: post.id, sourcePostId: post.id, caption: "", position: 0, createdAt: post.createdAt });
    if (post.mediaAssetIds.length) {
      const media = await db.select().from(mediaAssetsTable).where(inArray(mediaAssetsTable.id, post.mediaAssetIds.slice(0, 20)));
      for (const asset of media) if (asset.kind === "photo" || asset.kind === "audio") candidates.push({ id: `${asset.kind}:${asset.id}:${post.id}`, collectionId: "", kind: asset.kind, sourceId: asset.id, sourcePostId: post.id, caption: "", position: 0, createdAt: asset.createdAt });
    }
  }
  const resources = await db.select().from(resourcesTable).where(and(eq(resourcesTable.status, "reviewed"), eq(resourcesTable.category, "music"))).limit(100);
  for (const resource of resources) candidates.push({ id: `music:${resource.id}`, collectionId: "", kind: "music", sourceId: resource.id, sourcePostId: null, caption: "", position: 0, createdAt: resource.updatedAt });
  const items = await Promise.all(candidates.map(item => resolveMemory(item, memberId, memberId)));
  res.json(items.filter(item => !item.unavailable).slice(0, 300));
}));
router.get("/memory-reminder-preferences", route(async ({ res, memberId }) => {
  const [preference] = await db.select().from(memoryReminderPreferencesTable).where(eq(memoryReminderPreferencesTable.memberId, memberId));
  res.json({ enabled: preference?.enabled === true && !!preference.consentedAt, consentedAt: preference?.consentedAt?.toISOString() ?? null });
}));
router.patch("/memory-reminder-preferences", route(async ({ req, res, memberId }) => {
  const parsed = SetMemoryReminderPreferencesBody.strict().safeParse(req.body);
  if (!parsed.success || parsed.data.enabled && parsed.data.consent !== true) fail(400, "Explicit consent is required before showing memory reminders");
  const enabled = parsed.data!.enabled, consentedAt = enabled ? new Date() : null;
  await db.insert(memoryReminderPreferencesTable).values({ memberId, enabled, consentedAt }).onConflictDoUpdate({
    target: memoryReminderPreferencesTable.memberId, set: { enabled, consentedAt, updatedAt: sql`CURRENT_TIMESTAMP` } });
  res.json({ enabled, consentedAt: consentedAt?.toISOString() ?? null });
}));
router.get("/memory-reminders", route(async ({ res, memberId }) => {
  const [preference] = await db.select().from(memoryReminderPreferencesTable).where(eq(memoryReminderPreferencesTable.memberId, memberId));
  if (!preference?.enabled || !preference.consentedAt) { res.json([]); return; }
  const result: { collectionId: string; collectionName: string; item: Awaited<ReturnType<typeof resolveMemory>> }[] = [];
  for (const collection of await visibleCollections(memberId)) {
    const detail = await collectionDetail(collection, memberId);
    if (!detail) continue;
    for (const memory of detail.items) {
      if (!memory.unavailable && !result.some(entry => entry.item.kind === memory.kind && entry.item.sourceId === memory.sourceId))
        result.push({ collectionId: collection.id, collectionName: collection.name, item: memory });
      if (result.length >= 3) break;
    }
    if (result.length >= 3) break;
  }
  // Recheck opt-out after assembling results; no queued/cached notifications.
  const [live] = await db.select().from(memoryReminderPreferencesTable).where(eq(memoryReminderPreferencesTable.memberId, memberId));
  res.json(live?.enabled && live.consentedAt ? result : []);
}));
export default router;
