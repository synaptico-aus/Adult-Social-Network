import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, type MediaAsset, mediaVariantsTable } from "@workspace/db";
import { mediaFile } from "./media-storage";
import { pipeline } from "node:stream/promises";

export function videoRange(header: string | undefined, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new Error("Invalid range");
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = Math.min(match[2] && match[1] ? Number(match[2]) : size - 1, size - 1, start + 4 * 1024 * 1024 - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new Error("Invalid range");
  return { start, end };
}
const vttTime = (seconds: number) => {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
};
export function captionVtt(cues: MediaAsset["captions"]) {
  return "WEBVTT\n\n" + cues.map((cue, i) => `${i + 1}\n${vttTime(cue.start)} --> ${vttTime(cue.end)}\n${cue.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\r\n]/g, " ")}\n`).join("\n");
}
export function validateCaptionCues(cues: MediaAsset["captions"], duration: number, noSpeech = false) {
  if (noSpeech ? cues.length !== 0 : !cues.length) throw new Error("Choose timed captions or explicitly confirm no speech");
  let end = 0;
  for (const cue of cues) {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < end || cue.end <= cue.start || cue.end > duration || !cue.text.trim() ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(cue.text)) throw new Error("Captions need ordered, nonoverlapping timestamps within the video and readable text");
    end = cue.end;
  }
}
/** Call only after normal or exact reason-scoped staff authorisation. */
export async function serveVideoAsset(asset: MediaAsset, variant: string, req: Request, res: Response) {
  res.set({ "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline", "Vary": "Cookie, Authorization" });
  if (variant === "captions") { res.type("text/vtt").send(captionVtt(asset.captions)); return; }
  if (variant === "transcript") { res.type("text/plain").send(asset.transcript ?? "Transcript unavailable"); return; }
  const [row] = await db.select().from(mediaVariantsTable).where(and(eq(mediaVariantsTable.assetId, asset.id), eq(mediaVariantsTable.kind, variant as typeof mediaVariantsTable.$inferSelect["kind"]))).limit(1);
  if (!row) { res.status(404).end(); return; }
  const file = await mediaFile(row.objectPath).catch(() => null);
  if (!file) { res.status(404).end(); return; }
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  if (!Number.isSafeInteger(size) || size <= 0) { res.status(404).end(); return; }
  res.set({ "Content-Type": row.contentType, "Accept-Ranges": "bytes" });
  let range;
  try { range = videoRange(req.header("range"), size); } catch {
    res.status(416).set("Content-Range", `bytes */${size}`).end(); return;
  }
  if (range) res.status(206).set({ "Content-Range": `bytes ${range.start}-${range.end}/${size}`, "Content-Length": String(range.end - range.start + 1) });
  else res.set("Content-Length", String(size));
  const stream = file.createReadStream(range ?? undefined);
  const disconnected = () => stream.destroy();
  res.once("close", disconnected);
  try { await pipeline(stream, res); } catch { if (!res.headersSent) res.status(503).end(); }
  finally { res.off("close", disconnected); }
}
