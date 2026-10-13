import { mkdtemp, writeFile, rm, open } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getScannerHealth, scanLocalFile, MAX_UPLOAD_BYTES, streamToScanner } from "../lib/malware-scanner";
import { updateScannerSignatures } from "../lib/scanner-runtime";

const command = process.argv[2] ?? "status";
if (command === "verify") {
  const health = await getScannerHealth();
  if (!health.ready) { console.log(JSON.stringify(health)); process.exit(1); }
  const dir = await mkdtemp(join(tmpdir(), "me-scanner-verify-"));
  try {
    const clean = join(dir, "clean.txt"), eicar = join(dir, "eicar.txt"), large = join(dir, "large.bin");
    await writeFile(clean, "A harmless scanner readiness test.");
    await writeFile(eicar, "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
    const handle = await open(large, "w"); await handle.truncate(MAX_UPLOAD_BYTES); await handle.close();
    const cleanResult = await scanLocalFile(clean), eicarResult = await scanLocalFile(eicar), largeResult = await scanLocalFile(large);
    const offlineResult = await streamToScanner(clean, join(dir, "offline.sock"));
    const passed = cleanResult.state === "allowed" && eicarResult.state === "blocked"
      && largeResult.state === "allowed" && largeResult.details.scannedBytes === MAX_UPLOAD_BYTES && offlineResult.state === "unavailable";
    console.log(JSON.stringify({ passed, health, clean: cleanResult, eicar: eicarResult, fullSize: largeResult, offline: offlineResult }));
    process.exitCode = passed ? 0 : 1;
  } finally { await rm(dir, { recursive: true, force: true }); }
} else if (command === "update") {
  const updated = await updateScannerSignatures();
  console.log(JSON.stringify({ updated, ...await getScannerHealth() }));
  // Updates signatures only; the API owns the persistent daemon.
  process.exit(updated ? 0 : 1);
} else {
  const health = await getScannerHealth();
  console.log(JSON.stringify(health));
  process.exit(health.ready ? 0 : 1);
}
