import app from "./app";
import { logger } from "./lib/logger";
import { startResourceStaleChecks } from "./lib/resource-stale-checks";
import { startVideoProcessing } from "./lib/video-processing";
import { startMediaCleanup } from "./lib/media-deletion-hook";
import { startMalwareScanner } from "./lib/scanner-runtime";
import { startNonVideoScreeningRetries } from "./lib/non-video-screening";
import { startDeletionWorker } from "./lib/deletion-workflow";
import { startOperationalMonitor } from "./lib/operational-monitor";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startMalwareScanner();
  startNonVideoScreeningRetries();
  startResourceStaleChecks();
  startVideoProcessing();
  startMediaCleanup();
  startDeletionWorker();
  startOperationalMonitor();
});
