import { Storage } from "@google-cloud/storage";
import { randomUUID } from "node:crypto";

const sidecar = "http://127.0.0.1:1106";
const storage = new Storage({ credentials: { audience: "replit", subject_token_type: "access_token", token_url: `${sidecar}/token`, type: "external_account", credential_source: { url: `${sidecar}/credential`, format: { type: "json", subject_token_field_name: "access_token" } } }, projectId: "" });
const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export function assertProfilePhoto(contentType: string, size: number): void {
  if (!allowed.has(contentType) || !Number.isInteger(size) || size < 1 || size > PROFILE_PHOTO_MAX_BYTES) throw new Error("Profile photo must be JPEG, PNG, or WebP and no larger than 5 MB");
}
function parsePath(path: string) {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR is not configured");
  const clean = privateDir.replace(/^\/|\/$/g, "");
  const [bucket, ...prefix] = clean.split("/");
  return { bucket, object: `${prefix.join("/")}/${path.replace(/^\/objects\//, "")}` };
}
export async function requestProfilePhotoUpload(memberId: string, contentType: string, size: number) {
  assertProfilePhoto(contentType, size);
  const objectPath = `/objects/profile-photos/${memberId}/${randomUUID()}`;
  const { bucket, object } = parsePath(objectPath);
  const response = await fetch(`${sidecar}/object-storage/signed-object-url`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bucket_name: bucket, object_name: object, method: "PUT", expires_at: new Date(Date.now() + 900000).toISOString() }) });
  if (!response.ok) throw new Error("Could not create private upload URL");
  return { uploadURL: (await response.json() as { signed_url: string }).signed_url, objectPath };
}
export async function profilePhotoFile(objectPath: string) {
  if (!/^\/objects\/profile-photos\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/.test(objectPath)) throw new Error("Invalid private photo path");
  const { bucket, object } = parsePath(objectPath);
  const file = storage.bucket(bucket).file(object);
  const [exists] = await file.exists();
  if (!exists) return null;
  return file;
}

export async function deleteProfilePhoto(objectPath: string): Promise<void> {
  const file = await profilePhotoFile(objectPath);
  if (file) await file.delete();
}