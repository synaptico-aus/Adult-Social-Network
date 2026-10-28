import type { Request } from "express";
import { open } from "node:fs/promises";
import { UploadAdmissionError, UPLOAD_LIMITS } from "./upload-admission";

/** No storage write occurs until EOF and the exact byte count have been checked. */
export async function spoolUpload(req: Request, path: string, bytes: number, timeoutMs: number = UPLOAD_LIMITS.receiveMs) {
  const length = req.headers["content-length"];
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) !== bytes))
    throw new UploadAdmissionError(413, "Transfer length differs from the reserved byte count");
  if (req.headers["content-encoding"] && req.headers["content-encoding"] !== "identity")
    throw new UploadAdmissionError(415, "Encoded upload bodies are not accepted");
  const file = await open(path, "wx", 0o600);
  try {
    await stageUploadBody(req, chunk => file.writeFile(chunk), bytes, timeoutMs);
    if ((await file.stat()).size !== bytes) throw new UploadAdmissionError(503, "Staged upload size differs from reservation");
  } finally { await file.close(); }
}

/** EOF is not durable staging completion: every accepted write must succeed. */
export async function stageUploadBody(req: Request, write: (chunk: Buffer) => Promise<void>, bytes: number, timeoutMs: number = UPLOAD_LIMITS.receiveMs) {
  let received = 0;
  let pending = Promise.resolve();
  let ended = false;
  await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(new UploadAdmissionError(408, "Upload time limit exceeded")), timeoutMs);
      let finished = false;
      function finish(error?: Error) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        req.pause();
        req.off("data", data); req.off("end", end); req.off("aborted", aborted); req.off("error", aborted);
        error ? reject(error) : resolve();
      }
      const aborted = () => finish(new UploadAdmissionError(400, "Upload interrupted"));
      const end = () => {
        ended = true;
        if (received !== bytes) { finish(new UploadAdmissionError(400, "Upload ended before its reserved byte count")); return; }
        // In particular, EOF may arrive while the final disk write is pending.
        // Its rejection must fail admission, not become a late ignored error.
        void pending.then(() => finish(), () => finish(new UploadAdmissionError(503, "Upload staging failed")));
      };
      const data = (chunk: Buffer) => {
        if (finished) return;
        req.pause();
        received += chunk.length;
        if (received > bytes) { finish(new UploadAdmissionError(413, "Upload exceeds its reserved byte count")); return; }
        pending = pending.then(() => write(chunk));
        void pending.then(() => { if (!finished && !ended) req.resume(); }, () => finish(new UploadAdmissionError(503, "Upload staging failed")));
      };
      req.on("data", data); req.once("end", end); req.once("aborted", aborted); req.once("error", aborted);
      req.resume();
  });
}
