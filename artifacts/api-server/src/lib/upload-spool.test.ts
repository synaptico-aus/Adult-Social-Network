import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Request } from "express";
import { spoolUpload, stageUploadBody } from "./upload-spool";
import { UploadAdmissionError } from "./upload-admission";

test("local staging rejects truncated/encoded bodies and enforces a total receive deadline", async () => {
  const directory = await mkdtemp(join(tmpdir(), "me-upload-test-"));
  try {
    const truncated = Object.assign(new PassThrough(), { headers: {} });
    const short = spoolUpload(truncated as unknown as Request, join(directory, "short"), 4);
    truncated.end(Buffer.alloc(2));
    await assert.rejects(short, (e: unknown) => e instanceof UploadAdmissionError && e.status === 400);
    const encoded = Object.assign(new PassThrough(), { headers: { "content-encoding": "gzip" } });
    await assert.rejects(spoolUpload(encoded as unknown as Request, join(directory, "encoded"), 4), (e: unknown) => e instanceof UploadAdmissionError && e.status === 415);
    const slow = Object.assign(new PassThrough(), { headers: {} });
    const timed = spoolUpload(slow as unknown as Request, join(directory, "slow"), 4, 25);
    slow.write(Buffer.alloc(1));
    await assert.rejects(timed, (e: unknown) => e instanceof UploadAdmissionError && e.status === 408);
    assert.ok((await stat(join(directory, "slow"))).size <= 4);
    truncated.destroy(); encoded.destroy(); slow.destroy();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("EOF waits for a delayed final staging write before allowing storage", async () => {
  const req = Object.assign(new PassThrough(), { headers: {} });
  let completeWrite!: () => void;
  let writeStarted!: () => void;
  const started = new Promise<void>(resolve => { writeStarted = resolve; });
  const write = new Promise<void>(resolve => { completeWrite = resolve; });
  let stored = false;
  const staged = stageUploadBody(req as unknown as Request, async () => { writeStarted(); await write; }, 4)
    .then(() => { stored = true; });
  req.emit("data", Buffer.alloc(4));
  req.emit("end");
  await started;
  await Promise.resolve();
  assert.equal(stored, false, "EOF must not advance to storage while the final write is pending");
  completeWrite();
  await staged;
  assert.equal(stored, true);
  req.destroy();
});

test("a failing final staging write after EOF never advances to storage", async () => {
  const req = Object.assign(new PassThrough(), { headers: {} });
  let failWrite!: (error: Error) => void;
  let writeStarted!: () => void;
  const started = new Promise<void>(resolve => { writeStarted = resolve; });
  const write = new Promise<void>((_resolve, reject) => { failWrite = reject; });
  let stored = false;
  const staged = stageUploadBody(req as unknown as Request, async () => { writeStarted(); await write; }, 4)
    .then(() => { stored = true; });
  const refused = assert.rejects(staged, (error: unknown) => error instanceof UploadAdmissionError && error.status === 503);
  req.emit("data", Buffer.alloc(4));
  req.emit("end");
  await started;
  failWrite(new Error("Synthetic final disk-write failure"));
  await refused;
  assert.equal(stored, false);
  req.destroy();
});
