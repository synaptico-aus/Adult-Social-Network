import { parseBuffer } from "music-metadata";
import sharp from "sharp";

export const PHOTO_LIMIT = 10 * 1024 * 1024;
export const AUDIO_LIMIT = 50 * 1024 * 1024;
const photoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const audioTypes = new Set(["audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "audio/webm"]);
function normalizedType(type: string) {
  const bare = type.toLowerCase().split(";")[0].trim();
  return ({ "audio/mp3": "audio/mpeg", "audio/x-wav": "audio/wav", "audio/m4a": "audio/mp4", "audio/vorbis": "audio/ogg" } as Record<string, string>)[bare] ?? bare;
}
export function validateDeclared(kind: "photo" | "audio", type: string, size: number) {
  const allowed = kind === "photo" ? photoTypes : audioTypes;
  if (!allowed.has(normalizedType(type)) || !Number.isInteger(size) || size < 1 || size > (kind === "photo" ? PHOTO_LIMIT : AUDIO_LIMIT)) throw new Error(kind === "photo" ? "Photo must be JPEG, PNG, or WebP and no larger than 10 MiB" : "Audio must be MP3, WAV, M4A, OGG, or WebM and no larger than 50 MiB");
}
export async function inspectBytes(kind: "photo" | "audio", type: string, bytes: Buffer) {
  let actual: string | undefined;
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) actual = "image/png";
  else if (bytes.subarray(0, 3).equals(Buffer.from("ID3")) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) actual = "audio/mpeg";
  else if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE") actual = "audio/wav";
  else if (bytes.subarray(0, 4).toString() === "OggS") actual = "audio/ogg";
  else if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) actual = "audio/webm";
  else if (bytes.subarray(4, 8).toString() === "ftyp") actual = "audio/mp4";
  else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) actual = "image/jpeg";
  else if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") actual = "image/webp";
  if (!actual || (kind === "photo" ? !photoTypes.has(actual) : !audioTypes.has(actual))) throw new Error("Unsupported or unrecognized media bytes");
  if (normalizedType(type) !== actual) throw new Error("Declared content type does not match media bytes");
  if (kind === "photo") {
    const pipeline = sharp(bytes, { failOn: "warning" }).rotate();
    const sanitized = actual === "image/jpeg"
      ? await pipeline.jpeg().toBuffer({ resolveWithObject: true })
      : actual === "image/png"
        ? await pipeline.png().toBuffer({ resolveWithObject: true })
        : await pipeline.webp().toBuffer({ resolveWithObject: true });
    return { contentType: actual, width: sanitized.info.width, height: sanitized.info.height, durationSeconds: undefined, sanitizedBytes: sanitized.data };
  }
  const parsed = await parseBuffer(bytes, { mimeType: actual, size: bytes.length });
  const durationSeconds = parsed.format.duration === undefined ? undefined : Math.ceil(parsed.format.duration);
  if (durationSeconds === undefined || !Number.isFinite(durationSeconds)) throw new Error("Audio duration could not be validated");
  if (durationSeconds > 600) throw new Error("Audio must be 10 minutes or shorter");
  return { contentType: actual, width: undefined, height: undefined, durationSeconds, sanitizedBytes: undefined };
}