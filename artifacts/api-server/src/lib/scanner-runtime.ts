import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile, rename, rm, open } from "node:fs/promises";
import { join } from "node:path";
import { userInfo } from "node:os";
import { scannerDirectory, daemonCommand, getScannerHealth, setScannerUpdating } from "./malware-scanner";
import { logger } from "./logger";

const database = join(scannerDirectory, "db");
let daemon: ChildProcess | undefined;
let updater: ChildProcess | undefined;
let updatePromise: Promise<boolean> | undefined;
let started = false, stopping = false;
const childEnv = () => ({ PATH: process.env.PATH, HOME: scannerDirectory, LANG: "C" });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function prepareScannerConfig() {
  await mkdir(database, { recursive: true, mode: 0o700 });
  await writeFile(join(scannerDirectory, "freshclam.conf"), [
    `DatabaseDirectory ${database}`, `DatabaseOwner ${userInfo().username}`,
    "DatabaseMirror database.clamav.net", "DNSDatabaseInfo current.cvd.clamav.net",
    "ConnectTimeout 10", "ReceiveTimeout 60", "MaxAttempts 2", "TestDatabases yes",
    "ScriptedUpdates yes", "Checks 12",
  ].join("\n") + "\n", { mode: 0o600 });
  await writeFile(join(scannerDirectory, "clamd.conf"), [
    `DatabaseDirectory ${database}`, `LocalSocket ${join(scannerDirectory, "clamd.sock")}`,
    "LocalSocketMode 600", "FixStaleSocket yes", "Foreground yes",
    "MaxThreads 1", "MaxQueue 4", "MaxFileSize 256M", "MaxScanSize 512M",
    "StreamMaxLength 256M", "MaxScanTime 60000", "PCREMaxFileSize 256M",
    "AlertExceedsMax yes", "HeuristicAlerts yes", "AlertEncrypted yes",
    "BytecodeUnsigned no", "SelfCheck 3600", "CommandReadTimeout 5",
  ].join("\n") + "\n", { mode: 0o600 });
}

async function freshclam(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = updater = spawn("freshclam", ["--config-file", join(scannerDirectory, "freshclam.conf"), "--stdout"], { env: childEnv(), stdio: ["ignore", "pipe", "pipe"] });
    // Diagnostics concern update infrastructure, never upload contents; keep bounded.
    let diagnostic = "";
    const record = (chunk: Buffer) => { diagnostic = (diagnostic + chunk.toString()).slice(-4000); };
    child.stdout.on("data", record); child.stderr.on("data", record);
    const timeout = setTimeout(() => { child.kill("SIGKILL"); }, 5 * 60000);
    child.once("error", () => { clearTimeout(timeout); resolve(false); });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) logger.warn({ diagnostic }, "ClamAV official signature update failed; uploads remain held");
      resolve(code === 0);
    });
  });
}

async function launchDaemon() {
  if (await daemonCommand("PING").catch(() => "") === "PONG") return;
  if (daemon && daemon.exitCode === null) return;
  if (stopping) return;
  daemon = spawn("clamd", ["--config-file", join(scannerDirectory, "clamd.conf"), "--foreground"], { env: childEnv(), stdio: ["ignore", "pipe", "pipe"] });
  let diagnostic = "";
  daemon.stdout?.on("data", (chunk: Buffer) => { diagnostic = (diagnostic + chunk.toString()).slice(-2000); });
  daemon.stderr?.on("data", (chunk: Buffer) => { diagnostic = (diagnostic + chunk.toString()).slice(-2000); });
  daemon.once("error", () => { daemon = undefined; logger.error("ClamAV daemon unavailable; uploads remain held"); });
  daemon.once("exit", () => { daemon = undefined; if (!stopping) logger.warn({ diagnostic }, "ClamAV daemon stopped; uploads remain held until recovery"); });
  for (let i = 0; i < 60 && !stopping; i++) {
    if (await daemonCommand("PING").catch(() => "") === "PONG") return;
    await pause(1000);
  }
}

export async function updateScannerSignatures(startDaemon = false): Promise<boolean> {
  if (updatePromise) return updatePromise;
  updatePromise = (async () => {
    setScannerUpdating(true);
    try {
      await prepareScannerConfig();
      const receipt = join(scannerDirectory, "verified-update.json");
      if (!await freshclam()) { await rm(receipt, { force: true }); return false; }
      const versions: number[] = [];
      for (const name of ["daily.cvd", "daily.cld"]) {
        const handle = await open(join(database, name)).catch(() => null);
        if (!handle) continue;
        try {
          const header = Buffer.alloc(512); await handle.read(header, 0, 512, 0);
          const fields = header.toString().split(":");
          if (fields[0] === "ClamAV-VDB" && /^\d+$/.test(fields[2] ?? "")) versions.push(Number(fields[2]));
        } finally { await handle.close(); }
      }
      if (!versions.length) { await rm(receipt, { force: true }); return false; }
      await writeFile(`${receipt}.new`, JSON.stringify({ completedAt: Date.now(), dailyVersion: String(Math.max(...versions)) }), { mode: 0o600 });
      await rename(`${receipt}.new`, receipt);
      if (startDaemon) await launchDaemon();
      await daemonCommand("RELOAD").catch(() => "");
      return true;
    } catch { await rm(join(scannerDirectory, "verified-update.json"), { force: true }).catch(() => {}); logger.error("ClamAV updater failed; uploads remain held"); return false; }
    finally { setScannerUpdating(false); }
  })().finally(() => { updatePromise = undefined; });
  return updatePromise;
}

export function startMalwareScanner() {
  if (started || process.env.NODE_ENV === "test") return;
  started = true;
  void updateScannerSignatures(true);
  // Official updates every two hours; retry a failed bootstrap without busy polling.
  const timer = setInterval(async () => {
    const health = await getScannerHealth();
    let lastUpdate = 0;
    try { lastUpdate = JSON.parse(await readFile(join(scannerDirectory, "verified-update.json"), "utf8")).completedAt; } catch {}
    if (health.reason === "scanner_unavailable" && lastUpdate && Date.now() - lastUpdate < 48 * 60 * 60000) await launchDaemon();
    if (!health.ready || Date.now() - lastUpdate >= 2 * 60 * 60000) {
      // Failed updates (including CDN cooldowns) are retried no more than every two hours.
      if (Date.now() - lastAttempt < 2 * 60 * 60000) return;
      lastAttempt = Date.now(); await updateScannerSignatures(true);
    }
  }, 60000);
  let lastAttempt = Date.now();
  timer.unref();
  const stop = () => { stopping = true; clearInterval(timer); daemon?.kill("SIGTERM"); updater?.kill("SIGTERM"); };
  process.once("SIGTERM", () => { stop(); process.exit(0); }); process.once("SIGINT", () => { stop(); process.exit(0); }); process.once("exit", stop);
}
