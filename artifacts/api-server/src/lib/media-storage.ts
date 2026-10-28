import { Storage, type StorageOptions } from "@google-cloud/storage";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { db, mediaAssetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { reserveUpload, UPLOAD_LIMITS } from "./upload-admission";

const sidecar = "http://127.0.0.1:1106";
const createStorage = (retryOptions?: StorageOptions["retryOptions"]) => new Storage({ credentials: { audience: "replit", subject_token_type: "access_token", token_url: `${sidecar}/token`, type: "external_account", credential_source: { url: `${sidecar}/credential`, format: { type: "json", subject_token_field_name: "access_token" } } }, projectId: "", retryOptions });
const storage = createStorage();
// Dedicated client: bounded ingestion cannot leave resumable sessions or
// background retry loops beyond the cleanup uncertainty window.
const ingestionStorage = createStorage({ autoRetry: false, maxRetries: 0, totalTimeout: 60 });
type TestObject = { bytes: Buffer; contentType?: string; deleted?: boolean; delete?: () => Promise<void> };
/** Explicitly test-only storage injection; production cannot install this adapter. */
export function configureTestMediaStorage(objects: Map<string, TestObject> | null) {
  if (process.env.NODE_ENV !== "test") throw new Error("Test media storage is unavailable outside NODE_ENV=test");
  testStorage = objects;
}
let testStorage: Map<string, TestObject> | null = null;
const privateDir = () => {
  const value = process.env.PRIVATE_OBJECT_DIR;
  if (!value) throw new Error("PRIVATE_OBJECT_DIR is not configured");
  const [bucket, ...prefix] = value.replace(/^\/|\/$/g, "").split("/");
  return { bucket, prefix: prefix.join("/") };
};
export function mediaObjectPath(owner: string, id: string = randomUUID()) { return `/objects/media/${owner}/${id}`; }
function resolve(path: string) {
  const { bucket, prefix } = privateDir();
  return { bucket, object: `${prefix}/${path.replace(/^\/objects\//, "")}` };
}
export async function requestMediaUpload(path: string) {
  const [asset] = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.objectPath, path));
  if (!asset || asset.status !== "uploading" || asset.expiresAt <= new Date() || !asset.byteSize) throw new Error("Upload unavailable");
  return reserveUpload({ resourceId: asset.id, ownerMemberId: asset.ownerMemberId, purpose: "media", objectPath: path, contentType: asset.requestedContentType, byteSize: asset.byteSize });
}

/** Only admission-checked, exact-sized local files reach this private writer. */
export async function storeIngestedFile(path: string, localFile: string, contentType: string) {
  if (!/^\/objects\/(?:media|profile-photos)\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(path)) throw new Error("Invalid upload path");
  if (testStorage) {
    const { readFile } = await import("node:fs/promises");
    testStorage.set(path, { bytes: await readFile(localFile), contentType });
    return;
  }
  const { bucket, object } = resolve(path);
  await pipeline(createReadStream(localFile), ingestionStorage.bucket(bucket).file(object).createWriteStream({
    resumable: false, timeout: UPLOAD_LIMITS.storageMs,
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { contentType, cacheControl: "private, no-store, max-age=0" },
  }), { signal: AbortSignal.timeout(UPLOAD_LIMITS.storageMs) });
}

export async function deleteIngestedObject(path: string) {
  if (testStorage) {
    const entry = testStorage.get(path);
    if (entry?.delete) await entry.delete();
    if (entry) entry.deleted = true;
    return;
  }
  const { bucket, object } = resolve(path);
  await storage.bucket(bucket).file(object).delete({ ignoreNotFound: true });
}
export async function mediaFile(path: string) {
  if (testStorage) {
    const entry = testStorage.get(path);
    if (!entry || entry.deleted) return null;
    return { getMetadata: async () => [{ contentType: entry.contentType, size: entry.bytes.length, generation: "1" }], download: async () => [entry.bytes], createReadStream: (options?: { start?: number; end?: number }) => Readable.from(entry.bytes.subarray(options?.start ?? 0, options?.end === undefined ? undefined : options.end + 1)), delete: async () => entry.delete ? entry.delete() : (entry.deleted = true) } as any;
  }
  if (!/^\/objects\/media\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(path)) throw new Error("Invalid media path");
  const { bucket, object } = resolve(path);
  const file = storage.bucket(bucket).file(object);
  const [exists] = await file.exists();
  return exists ? file : null;
}
export async function deleteMediaObject(path: string) {
  const file = await mediaFile(path);
  if (file) await file.delete();
}

export async function replaceMediaObject(path: string, bytes: Buffer, contentType: string) {
  if (testStorage) {
    const entry = testStorage.get(path);
    if (!entry || entry.deleted) throw new Error("Media object is unavailable");
    entry.bytes = bytes;
    entry.contentType = contentType;
    return;
  }
  const { bucket, object } = resolve(path);
  await storage.bucket(bucket).file(object).save(bytes, {
    contentType,
    resumable: false,
    metadata: { cacheControl: "private, no-store, max-age=0" },
  });
}

/** Immutable server-owned copy: an outstanding PUT URL cannot replace playback. */
export async function freezeMediaObject(path: string, destination: string) {
  if (testStorage) {
    const entry = testStorage.get(path);
    if (!entry || entry.deleted) throw new Error("Upload missing");
    testStorage.set(destination, { bytes: Buffer.from(entry.bytes), contentType: entry.contentType });
    return;
  }
  const from = resolve(path);
  const to = resolve(destination);
  const file = storage.bucket(from.bucket).file(from.object);
  const [metadata] = await file.getMetadata();
  await storage.bucket(from.bucket).file(from.object, { generation: metadata.generation })
    .copy(storage.bucket(to.bucket).file(to.object), { preconditionOpts: { ifGenerationMatch: 0 } });
}

/** Only worker-generated files may use this; no client-controlled object paths. */
export async function storeProcessedFile(path: string, localFile: string, contentType: string) {
  if (testStorage) {
    const { readFile } = await import("node:fs/promises");
    testStorage.set(path, { bytes: await readFile(localFile), contentType });
    return;
  }
  const { bucket, object } = resolve(path);
  await storage.bucket(bucket).upload(localFile, {
    destination: object, resumable: true, timeout: 60000,
    metadata: { contentType, cacheControl: "private, no-store, max-age=0" },
  });
}