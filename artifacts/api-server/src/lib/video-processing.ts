import { spawn } from "node:child_process";
import { mkdtemp, rm, stat, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import { db, mediaAssetsTable, mediaVariantsTable, videoJobsTable, mediaScreeningResultsTable } from "@workspace/db";
import { mediaFile, mediaObjectPath, storeProcessedFile, deleteMediaObject } from "./media-storage";
import { REEL_DURATION, VIDEO_DURATION, validateDeclared, VIDEO_LIMIT } from "./media-validation";
import { logger } from "./logger";

export function runMediaTool(binary: string, args: string[], timeout = 90000, maxOutput = 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"],
      // Decoders/scanners do not need application credentials.
      env: { PATH: process.env.PATH, HOME: tmpdir(), LANG: "C", AV_LOG_FORCE_NOCOLOR: "1" } });
    let stdout = "", count = 0;
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Media processor timeout")); }, timeout);
    child.stdout.on("data", (chunk: Buffer) => { count += chunk.length; if (count > maxOutput) { child.kill("SIGKILL"); reject(new Error("Processor output limit")); } else stdout += chunk.toString(); });
    // Consume, but never expose attacker-controlled FFmpeg diagnostic text.
    child.stderr.on("data", () => {});
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => { clearTimeout(timer); if (code === 0) resolve(stdout); else reject(new Error(`Media processor failed (${code})`)); });
  });
}
const safeInput = ["-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm"];
export function validateVideoProbe(probe: any, format: "reel" | "post") {
  const streams = probe.streams ?? [];
  const videos = streams.filter((s: any) => s.codec_type === "video" && s.disposition?.attached_pic !== 1);
  const audios = streams.filter((s: any) => s.codec_type === "audio");
  const video = videos[0];
  const duration = Number(probe.format?.duration);
  if (!video || videos.length !== 1 || audios.length > 1 || streams.some((s: any) => !["video", "audio"].includes(s.codec_type))) throw new Error("Only one video and at most one audio stream are accepted");
  if (!Number.isFinite(duration) || duration <= 0 || duration > (format === "reel" ? REEL_DURATION : VIDEO_DURATION)) throw new Error(`Video must be ${format === "reel" ? REEL_DURATION : VIDEO_DURATION} seconds or shorter`);
  let width = Number(video.width), height = Number(video.height);
  const rotation = Number(video.side_data_list?.find((s: any) => s.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0);
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];
  if (!Number.isInteger(width) || !Number.isInteger(height) || Math.min(width, height) < 16 || Math.max(width, height) > 4096) throw new Error("Video dimensions must be 16–4096 pixels");
  const [n, d] = String(video.avg_frame_rate ?? "0/1").split("/").map(Number);
  if (!d || !Number.isFinite(n / d) || n / d <= 0 || n / d > 60) throw new Error("Video frame rate must be 1–60 fps");
  if (format === "reel" && width > height) throw new Error("Reels must be portrait or square");
  return { width, height, durationSeconds: Math.ceil(duration), hasAudio: audios.length === 1 };
}
export async function buildVideoFiles(input: string, directory: string, format: "reel" | "post") {
  const probe = JSON.parse(await runMediaTool("ffprobe", ["-v", "error", ...safeInput, "-show_format", "-show_streams", "-of", "json", input], 15000));
  const info = validateVideoProbe(probe, format);
  const outputs: { kind: "standard" | "low" | "webm" | "thumbnail" | "frames" | "audio"; path: string; type: string }[] = [];
  const global = ["-nostdin", "-v", "error", "-y", "-max_alloc", "67108864", "-threads", "1", "-filter_threads", "1"];
  for (const [kind, size, bitrate] of [["standard", 720, "1400k"], ["low", 360, "350k"]] as const) {
    const path = join(directory, `${kind}.mp4`);
    await runMediaTool("ffmpeg", [...global, ...safeInput, "-i", input, "-map", "0:v:0", "-map", "0:a:0?",
      "-map_metadata", "-1", "-map_chapters", "-1", "-sn", "-dn",
      "-vf", `scale=w='min(${size},iw)':h='min(${size},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1`,
      "-r", "30", "-c:v", "libx264", "-threads", "1", "-profile:v", "baseline", "-level", "3.1", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-b:v", bitrate, "-maxrate", bitrate, "-bufsize", bitrate,
      "-c:a", "aac", "-b:a", kind === "low" ? "48k" : "96k", "-movflags", "+faststart",
      "-t", String(info.durationSeconds), "-fs", String(160 * 1024 * 1024), path], 240000);
    const playbackProbe = JSON.parse(await runMediaTool("ffprobe", ["-v", "error", ...safeInput, "-show_format", "-of", "json", path], 15000));
    // A file-size cap must never silently turn full-video review into prefix-only review.
    if (Math.abs(Number(playbackProbe.format?.duration) - Number(probe.format?.duration)) > 0.25) throw new Error("Processed playback duration differs from the complete source");
    outputs.push({ kind, path, type: "video/mp4" });
  }
  const webm = join(directory, "portable.webm");
  await runMediaTool("ffmpeg", [...global, ...safeInput, "-i", input, "-map", "0:v:0", "-map", "0:a:0?",
    "-map_metadata", "-1", "-map_chapters", "-1", "-sn", "-dn",
    "-vf", "scale=w='min(360,iw)':h='min(360,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
    "-r", "30", "-c:v", "libvpx-vp9", "-threads", "1", "-deadline", "realtime", "-cpu-used", "8",
    "-pix_fmt", "yuv420p", "-b:v", "350k", "-c:a", "libopus", "-b:a", "48k",
    "-t", String(info.durationSeconds), "-fs", String(64 * 1024 * 1024), webm], 240000);
  const portableProbe = JSON.parse(await runMediaTool("ffprobe", ["-v", "error", ...safeInput, "-show_format", "-of", "json", webm], 15000));
  if (Math.abs(Number(portableProbe.format?.duration) - Number(probe.format?.duration)) > 0.25) throw new Error("Portable playback duration differs from the complete source");
  outputs.push({ kind: "webm", path: webm, type: "video/webm" });
  const thumbnail = join(directory, "thumbnail.jpg");
  await runMediaTool("ffmpeg", [...global, ...safeInput, "-i", input, "-vf", "scale=320:-2", "-frames:v", "1", "-map_metadata", "-1", thumbnail]);
  outputs.push({ kind: "thumbnail", path: thumbnail, type: "image/jpeg" });
  // Temporal sampling is evidence, NOT full-video screening. Bound to <=120 frames.
  const frames = join(directory, "frames.jpg");
  await runMediaTool("ffmpeg", [...global, ...safeInput, "-i", input, "-vf",
    `fps=1/${Math.max(1, Math.ceil(info.durationSeconds / 120))},scale=96:-2,tile=12x10`,
    "-frames:v", "1", "-map_metadata", "-1", frames]);
  outputs.push({ kind: "frames", path: frames, type: "image/jpeg" });
  if (info.hasAudio) {
    const audio = join(directory, "audio.m4a");
    await runMediaTool("ffmpeg", [...global, ...safeInput, "-i", input, "-map", "0:a:0", "-vn", "-c:a", "aac", "-b:a", "48k", "-map_metadata", "-1", audio]);
    outputs.push({ kind: "audio", path: audio, type: "audio/mp4" });
  }
  return { info, outputs };
}
export async function scanVideoMalware(path: string) {
  if (process.env.NODE_ENV === "test" && process.env.MEDIA_TEST_PROVIDER === "allow") return { state: "allowed" as const, provider: "test-only" };
  try { await runMediaTool("clamscan", ["--no-summary", path], 90000); return { state: "allowed" as const, provider: "clamav" }; }
  catch (error) {
    return { state: error instanceof Error && error.message === "Media processor failed (1)" ? "blocked" as const : "unavailable" as const, provider: "clamav" };
  }
}
export async function runVideoJobOnce() {
  const job = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(videoJobsTable).where(and(
      or(eq(videoJobsTable.state, "pending"), and(eq(videoJobsTable.state, "processing"), lt(videoJobsTable.leaseUntil, new Date()))),
      lt(videoJobsTable.attempts, 3))).orderBy(asc(videoJobsTable.createdAt)).limit(1).for("update", { skipLocked: true });
    if (!row) return null;
    return (await tx.update(videoJobsTable).set({ state: "processing", attempts: row.attempts + 1, leaseUntil: new Date(Date.now() + 30 * 60000), error: null }).where(eq(videoJobsTable.id, row.id)).returning())[0];
  });
  if (!job) return false;
  const directory = await mkdtemp(join(tmpdir(), "me-video-"));
  const written: string[] = [];
  try {
    const [asset] = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, job.assetId));
    if (!asset || asset.status !== "quarantined") throw new Error("Video no longer eligible for processing");
    const file = await mediaFile(asset.objectPath);
    if (!file) throw new Error("Video upload missing");
    const [metadata] = await file.getMetadata();
    validateDeclared("video", asset.requestedContentType, Number(metadata.size), asset.videoFormat ?? "post");
    const local = join(directory, "input");
    let total = 0;
    const bound = new Transform({ transform(chunk: Buffer, _encoding, done) {
      total += chunk.length;
      if (total > VIDEO_LIMIT) done(new Error("Video source size exceeded")); else done(null, chunk);
    } });
    await pipeline(file.createReadStream(), bound, createWriteStream(local), { signal: AbortSignal.timeout(60000) });
    validateDeclared("video", asset.requestedContentType, total, asset.videoFormat ?? "post");
    const handle = await open(local);
    const magic = Buffer.alloc(16);
    try { await handle.read(magic, 0, magic.length, 0); } finally { await handle.close(); }
    const isMp4 = magic.toString("ascii", 4, 8) === "ftyp";
    const isWebm = magic.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (asset.requestedContentType === "video/webm" ? !isWebm : !isMp4) throw new Error("Video bytes must be the declared container type");
    const malware = await scanVideoMalware(local);
    if (malware.state === "blocked") throw new Error("Video malware scan blocked the upload");
    const built = await buildVideoFiles(local, directory, asset.videoFormat ?? "post");
    const variants: typeof mediaVariantsTable.$inferInsert[] = [];
    for (const output of built.outputs) {
      const objectPath = mediaObjectPath(asset.ownerMemberId);
      // Register cleanup ownership before upload; crash-created files are discoverable.
      const variant = { id: randomUUID(), assetId: asset.id, kind: output.kind, objectPath, contentType: output.type, byteSize: (await stat(output.path)).size };
      variants.push(variant);
      await db.transaction(async (tx) => {
        const [live] = await tx.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id)).for("update");
        if (!live || live.status !== "quarantined") throw new Error("Video cancelled during processing");
        const old = await tx.select().from(mediaVariantsTable).where(and(eq(mediaVariantsTable.assetId, asset.id), eq(mediaVariantsTable.kind, variant.kind)));
        for (const previous of old) await deleteMediaObject(previous.objectPath);
        await tx.delete(mediaVariantsTable).where(and(eq(mediaVariantsTable.assetId, asset.id), eq(mediaVariantsTable.kind, variant.kind)));
        await tx.insert(mediaVariantsTable).values(variant);
        written.push(objectPath);
      });
      // Ownership is committed BEFORE creating the object, so crash cleanup can find it.
      await db.transaction(async (tx) => {
        const [live] = await tx.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id)).for("update");
        if (!live || live.status !== "quarantined") throw new Error("Video cancelled during processing");
        await storeProcessedFile(objectPath, output.path, output.type);
      });
    }
    await db.transaction(async (tx) => {
      const [live] = await tx.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id)).for("update");
      if (!live || live.status !== "quarantined") throw new Error("Video cancelled during processing");
      const coverage = { strategy: "temporal-samples-and-full-human-video-audio-v1", sampleIntervalSeconds: Math.max(1, Math.ceil(built.info.durationSeconds / 120)), maximumFrames: 120,
        durationSeconds: built.info.durationSeconds, hasAudio: built.info.hasAudio, captionVersion: live.captionVersion,
        limitation: "Frame sampling and thumbnail scanning do not cover every frame or audio segment; full independent human review required" };
      await tx.insert(mediaScreeningResultsTable).values([
        { id: randomUUID(), assetId: asset.id, kind: "malware", provider: malware.provider, state: malware.state, details: coverage },
        { id: randomUUID(), assetId: asset.id, kind: "video_frames", provider: "unconfigured", state: "unavailable", details: coverage },
        { id: randomUUID(), assetId: asset.id, kind: "video_audio", provider: "unconfigured", state: "unavailable", details: coverage },
      ]);
      await tx.update(mediaAssetsTable).set({ width: built.info.width, height: built.info.height, durationSeconds: built.info.durationSeconds, contentType: "video/mp4", byteSize: total, status: "held",
        malwareState: malware.state, abuseState: "unavailable", rejectionReason: "Held: full video/audio review required; unavailable malware checks cannot be waived",
        metadata: { ...(live.metadata as object ?? {}), ...coverage, playbackVariants: variants.map((v) => v.kind) },
      }).where(eq(mediaAssetsTable.id, asset.id));
      await tx.update(videoJobsTable).set({ state: "complete", leaseUntil: null }).where(eq(videoJobsTable.id, job.id));
    });
  } catch (error) {
    logger.warn({ assetId: job.assetId, err: error }, "Video processing did not complete");
    for (const path of written) await deleteMediaObject(path).catch(() => {});
    await db.transaction(async (tx) => {
      const [asset] = await tx.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, job.assetId)).for("update");
      if (!asset || asset.status !== "quarantined") {
        await tx.update(videoJobsTable).set({ state: "failed", leaseUntil: null, error: "Upload cancelled or removed" }).where(eq(videoJobsTable.id, job.id));
        return;
      }
      // Invalid bytes and blocked files are terminal; operational failures retry at most 3 times.
      const terminal = job.attempts >= 3 || (error instanceof Error && /must be|dimensions|frame rate|Only one|malware scan blocked/.test(error.message));
      const reason = error instanceof Error && terminal ? error.message.slice(0, 200) : "Video processing interrupted; bounded retry scheduled";
      await tx.update(videoJobsTable).set({ state: terminal ? "failed" : "pending", leaseUntil: null, error: reason }).where(eq(videoJobsTable.id, job.id));
      await tx.update(mediaAssetsTable).set({ status: terminal ? "held" : "quarantined", rejectionReason: reason,
        malwareState: reason.includes("malware scan blocked") ? "blocked" : asset.malwareState }).where(eq(mediaAssetsTable.id, asset.id));
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
  return true;
}
export function startVideoProcessing() {
  let working = false;
  const run = async () => {
    if (working) return;
    working = true;
    try {
      await db.update(videoJobsTable).set({ state: "failed", error: "Processing retry limit reached" }).where(and(eq(videoJobsTable.state, "processing"), lt(videoJobsTable.leaseUntil, new Date()), sql`${videoJobsTable.attempts} >= 3`));
      await db.update(mediaAssetsTable).set({ status: "held", rejectionReason: "Processing failed after bounded retries; staff intervention required" })
        .where(and(eq(mediaAssetsTable.status, "quarantined"), sql`exists (select 1 from video_processing_jobs j where j.asset_id = ${mediaAssetsTable.id} and j.state = 'failed')`));
      await runVideoJobOnce();
    } catch (error) { logger.error({ err: error }, "Video job worker failed"); }
    finally { working = false; }
  };
  const timer = setInterval(() => { void run(); }, 5000);
  timer.unref();
  void run();
}
