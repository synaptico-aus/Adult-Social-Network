import { randomUUID } from "node:crypto";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db, mediaAssetsTable, mediaScreeningResultsTable } from "@workspace/db";
import { deleteMediaObject, freezeMediaObject, mediaFile, mediaObjectPath, replaceMediaObject } from "./media-storage";
import { assertMediaMagic, inspectBytes, validateDeclared, PHOTO_LIMIT, AUDIO_LIMIT } from "./media-validation";
import { getScannerHealth, scanMediaBytes, type MalwareResult } from "./malware-scanner";
import { logger } from "./logger";

export async function completeNonVideo(assetId: string, recover = false) {
  const source = await db.transaction(async (tx) => {
    const [asset] = await tx.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, assetId)).for("update");
    if (!asset || asset.kind === "video") throw new Error("Upload not found");
    if (asset.status === "quarantined" && (!recover || asset.updatedAt.getTime() > Date.now() - 5 * 60000)) return null;
    if (!["uploading", "quarantined", "held"].includes(asset.status) || (asset.status === "held" && asset.malwareState === "allowed")) throw new Error("Upload cannot be completed");
    let path = asset.objectPath;
    let metadata = (asset.metadata as Record<string, unknown> | null) ?? {};
    if (asset.status === "uploading") {
      if (asset.expiresAt < new Date()) throw new Error("Upload expired");
      const file = await mediaFile(path);
      if (!file) throw new Error("Upload has not completed");
      const [info] = await file.getMetadata();
      validateDeclared(asset.kind, asset.requestedContentType, Number(info.size));
      const frozen = mediaObjectPath(asset.ownerMemberId, `${asset.id}_source`);
      await deleteMediaObject(frozen);
      await freezeMediaObject(path, frozen);
      metadata = { ...metadata, stagingPath: path, nonVideoProcessing: true };
      path = frozen;
    }
    return (await tx.update(mediaAssetsTable).set({ objectPath: path, metadata, status: "quarantined", rejectionReason: "Malware screening in progress" }).where(eq(mediaAssetsTable.id, asset.id)).returning())[0];
  });
  if (!source) return (await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, assetId)))[0];
  let scanned: MalwareResult | undefined;
  let invalidMagic = false;
  try {
    const file = await mediaFile(source.objectPath);
    if (!file) throw new Error("Upload missing");
    const stream = file.createReadStream();
    const timeout = setTimeout(() => stream.destroy(new Error("Upload read timeout")), 60000);
    const chunks: Buffer[] = []; let size = 0;
    try {
      for await (const chunk of stream) {
        const bytes = Buffer.from(chunk); size += bytes.length;
        if (size > (source.kind === "photo" ? PHOTO_LIMIT : AUDIO_LIMIT)) throw new Error("Uploaded file exceeds limit");
        chunks.push(bytes);
      }
    } finally { clearTimeout(timeout); stream.destroy(); }
    validateDeclared(source.kind as "photo" | "audio", source.requestedContentType, size);
    const bytes = Buffer.concat(chunks);
    try { assertMediaMagic(source.kind as "photo" | "audio", source.requestedContentType, bytes); }
    catch (error) { invalidMagic = true; throw error; }
    const malware = scanned = await scanMediaBytes(bytes);
    // Unavailable scanners never feed untrusted bytes into a media decoder.
    const inspected = malware.state === "allowed" ? await inspectBytes(source.kind as "photo" | "audio", source.requestedContentType, bytes) : null;
    const abuse = process.env.NODE_ENV === "test" && process.env.MEDIA_TEST_PROVIDER === "allow"
      ? { state: "allowed" as const, provider: "test-only" } : { state: "unavailable" as const, provider: "unconfigured" };
    return await db.transaction(async (tx) => {
      const [live] = await tx.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, source.id)).for("update");
      if (!live || live.status !== "quarantined" || live.objectPath !== source.objectPath) throw new Error("Upload cancelled or removed");
      if (inspected?.sanitizedBytes) await replaceMediaObject(live.objectPath, inspected.sanitizedBytes, inspected.contentType);
      await tx.insert(mediaScreeningResultsTable).values([
        { id: randomUUID(), assetId: live.id, kind: "malware", state: malware.state, provider: malware.provider, details: malware.details },
        { id: randomUUID(), assetId: live.id, kind: "abuse", state: abuse.state, provider: abuse.provider },
      ]);
      const durationReady = live.kind === "photo" || inspected?.durationSeconds !== undefined;
      const ready = malware.state === "allowed" && abuse.state === "allowed" && durationReady && (live.kind === "photo" || !!live.transcript);
      return (await tx.update(mediaAssetsTable).set({
        status: malware.state === "blocked" ? "rejected" : ready ? "ready" : "held",
        malwareState: malware.state, abuseState: abuse.state, byteSize: size,
        contentType: inspected?.contentType ?? live.requestedContentType,
        width: inspected?.width ?? null, height: inspected?.height ?? null, durationSeconds: inspected?.durationSeconds ?? null,
        rejectionReason: malware.state === "blocked" ? "Malware detected; upload rejected" : malware.state !== "allowed"
          ? "Malware screening unavailable or incomplete; held without decoding"
          : abuse.state !== "allowed" ? "Content safety review is unavailable; upload remains held"
          : !durationReady ? "Trusted audio duration is required" : !ready ? "Transcript is required" : null,
      }).where(eq(mediaAssetsTable.id, live.id)).returning())[0];
    });
  } catch (error) {
    await db.update(mediaAssetsTable).set({ status: invalidMagic || scanned?.state === "allowed" ? "rejected" : "held",
      malwareState: scanned?.state ?? "unavailable", rejectionReason: invalidMagic || scanned?.state === "allowed" ? "Invalid or incomplete media" : "Media processing unavailable; upload held for retry" })
      .where(and(eq(mediaAssetsTable.id, source.id), eq(mediaAssetsTable.status, "quarantined")));
    throw error;
  }
}

export function startNonVideoScreeningRetries() {
  if (process.env.NODE_ENV === "test") return;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy || !(await getScannerHealth()).ready) return;
    busy = true;
    try {
      const assets = await db.select({ id: mediaAssetsTable.id }).from(mediaAssetsTable).where(and(
        inArray(mediaAssetsTable.kind, ["photo", "audio"]), lt(mediaAssetsTable.updatedAt, new Date(Date.now() - 5 * 60000)),
        or(and(eq(mediaAssetsTable.status, "held"), inArray(mediaAssetsTable.malwareState, ["unavailable", "error", "pending"])),
          and(eq(mediaAssetsTable.status, "quarantined"), sql`${mediaAssetsTable.metadata}->>'nonVideoProcessing' = 'true'`)),
      )).limit(5);
      for (const asset of assets) await completeNonVideo(asset.id, true).catch(() => logger.warn("A held media upload could not be reprocessed"));
    } catch { logger.error("Held media retry cycle failed"); }
    finally { busy = false; }
  }, 60000);
  timer.unref();
}
