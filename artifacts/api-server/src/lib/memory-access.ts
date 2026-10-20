import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db, memoryCollectionsTable, memoryItemsTable, hiddenMemoriesTable, memoryReminderPreferencesTable,
  postsTable, mediaAssetsTable, resourcesTable, profilesTable, type MemoryCollection, type MemoryItem } from "@workspace/db";
import { visiblePost } from "../routes/posts";
import { canReadMedia } from "./media-authority";
import type { MemoryItem as MemoryView } from "@workspace/api-zod";

export function collectionPost(collection: MemoryCollection): typeof postsTable.$inferSelect {
  return { id: `memory-audience:${collection.id}`, authorMemberId: collection.ownerMemberId, body: collection.name,
    audience: collection.audience, circleId: collection.circleId, groupId: collection.groupId,
    status: "published", publishedAt: collection.sharedAt, createdAt: collection.createdAt, updatedAt: collection.updatedAt,
    isIntroduction: false, responseLabel: null, commentsOpen: false, visibleReactionCounts: false,
    originalPostId: null, commentary: null, mediaAssetIds: [], friendRestrictions: {}, deletedAt: null };
}
export async function canViewCollection(collection: MemoryCollection, viewer: string) {
  // The owner can manage their own metadata after a circle closes; source access is
  // still checked independently below, even for the owner.
  if (collection.ownerMemberId === viewer) return true;
  return !collection.sharingHeld && visiblePost(collectionPost(collection), viewer);
}
export async function collectionOutput(collection: MemoryCollection, viewer: string) {
  return { id: collection.id, ownerMemberId: collection.ownerMemberId, name: collection.name, audience: collection.audience,
    circleId: collection.circleId, groupId: collection.groupId, createdAt: collection.createdAt.toISOString(),
    updatedAt: collection.updatedAt.toISOString(), isOwner: collection.ownerMemberId === viewer,
    sharingHeld: collection.sharingHeld };
}
export function sourceKey(item: Pick<MemoryItem, "kind" | "sourceId">) { return `${item.kind}:${item.sourceId}`; }
export function unavailableItem(item: Pick<MemoryItem, "id" | "position">, hidden = false): MemoryView {
  return { id: item.id, position: item.position, unavailable: true, hidden,
    kind: null, sourceId: null, sourcePostId: null, caption: null, body: null, authorName: null,
    authorMemberId: null, mediaUrl: null, transcript: null, altText: null, url: null, title: null, sourceDate: null };
}
export async function resolveMemory(item: MemoryItem, curator: string, viewer: string): Promise<MemoryView> {
  const empty = unavailableItem(item);
  const [hidden] = await db.select({ id: hiddenMemoriesTable.id }).from(hiddenMemoriesTable)
    .where(and(eq(hiddenMemoriesTable.memberId, viewer), eq(hiddenMemoriesTable.sourceKey, sourceKey(item)))).limit(1);
  if (hidden) return unavailableItem(item, true);
  const base = { ...empty, unavailable: false, kind: item.kind, sourceId: item.sourceId,
    sourcePostId: item.sourcePostId, caption: item.caption };
  if (item.kind === "music") {
    const [resource] = await db.select().from(resourcesTable).where(eq(resourcesTable.id, item.sourceId)).limit(1);
    if (!resource || resource.category.toLowerCase() !== "music" || resource.status !== "reviewed" || resource.linkState === "unavailable") return empty;
    let url: URL;
    try { url = new URL(resource.url); } catch { return empty; }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return empty;
    return { ...base, url: resource.url, title: resource.title, authorName: resource.domain,
      sourceDate: resource.sourceDate?.toISOString() ?? null };
  }
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, item.kind === "post" ? item.sourceId : item.sourcePostId ?? "")).limit(1);
  if (!post || post.status !== "published" || !(await visiblePost(post, curator)) || !(await visiblePost(post, viewer))) return empty;
  const [author] = await db.select().from(profilesTable).where(eq(profilesTable.memberId, post.authorMemberId)).limit(1);
  const common = { ...base, sourcePostId: post.id, authorMemberId: post.authorMemberId,
    authorName: author?.preferredName ?? "Member", url: `/posts/${encodeURIComponent(post.id)}`,
    sourceDate: (post.publishedAt ?? post.createdAt).toISOString() };
  if (item.kind === "post") return { ...common, body: post.body, title: post.body.slice(0, 100) || "Story" };
  if (!post.mediaAssetIds.includes(item.sourceId)) return empty;
  const [media] = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, item.sourceId)).limit(1);
  if (!media || media.kind !== item.kind || media.status !== "ready" || !(await canReadMedia(media, curator)) || !(await canReadMedia(media, viewer))) return empty;
  return { ...common, body: post.body, title: item.kind === "photo" ? "Photo" : "Voice recording",
    mediaUrl: `/api/media/${encodeURIComponent(media.id)}`, transcript: media.transcript, altText: media.altText };
}
export async function visibleCollections(viewer: string) {
  const own = await db.select().from(memoryCollectionsTable).where(eq(memoryCollectionsTable.ownerMemberId, viewer)).orderBy(desc(memoryCollectionsTable.updatedAt)).limit(100);
  const shared = await db.select().from(memoryCollectionsTable).where(and(ne(memoryCollectionsTable.ownerMemberId, viewer), ne(memoryCollectionsTable.audience, "only_me")))
    .orderBy(desc(memoryCollectionsTable.updatedAt)).limit(100);
  const checked = await Promise.all(shared.map(async (collection) => await canViewCollection(collection, viewer) ? collection : null));
  return [...own, ...checked.filter((collection): collection is MemoryCollection => !!collection)];
}
export async function collectionDetail(collection: MemoryCollection, viewer: string, exporting = false) {
  const rows = await db.select().from(memoryItemsTable).where(eq(memoryItemsTable.collectionId, collection.id)).orderBy(asc(memoryItemsTable.position), asc(memoryItemsTable.id));
  const items = await Promise.all(rows.map(async (row) => {
    const item = await resolveMemory(row, collection.ownerMemberId, viewer);
    if (!exporting || item.unavailable || item.authorMemberId === viewer) return item;
    // Other authors and music: only a reference and permitted attribution/title.
    return { ...item, body: null, mediaUrl: null, transcript: null, altText: null,
      title: item.kind === "music" ? item.title : "Shared memory (reference only)" };
  }));
  const [current] = await db.select().from(memoryCollectionsTable).where(eq(memoryCollectionsTable.id, collection.id)).limit(1);
  if (!current || current.revision !== collection.revision || !(await canViewCollection(current, viewer))) {
    // Do not combine captions from a newer held revision with older sharing approval.
    return null;
  }
  return { collection: await collectionOutput(current, viewer), items };
}
export async function exportMemberMemories(memberId: string) {
  const collections = await db.select().from(memoryCollectionsTable).where(eq(memoryCollectionsTable.ownerMemberId, memberId));
  const [preferences] = await db.select().from(memoryReminderPreferencesTable).where(eq(memoryReminderPreferencesTable.memberId, memberId));
  const hidden = await db.select().from(hiddenMemoriesTable).where(eq(hiddenMemoriesTable.memberId, memberId));
  const exported = await Promise.all(collections.map((collection) => collectionDetail(collection, memberId, true)));
  if (exported.some(collection => !collection)) throw new Error("A memory collection changed during export; retry the export");
  return { collections: exported,
    reminderPreferences: { enabled: preferences?.enabled ?? false, consentedAt: preferences?.consentedAt ?? null }, hiddenMemories: hidden };
}
