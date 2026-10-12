import { db, resourcesTable } from "@workspace/db";
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { checkResourceRow } from "../routes/resources";
import { logger } from "./logger";

/** Bounded periodic maintenance; no content downloading or rehosting. */
export function startResourceStaleChecks() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const due = await db.select().from(resourcesTable).where(and(eq(resourcesTable.status, "reviewed"),
        or(isNull(resourcesTable.lastCheckedAt), lt(resourcesTable.lastCheckedAt, new Date(Date.now() - 30 * 86400000)))))
        .orderBy(asc(resourcesTable.lastCheckedAt)).limit(10);
      for (const row of due) await checkResourceRow(row);
    } catch (error) { logger.error({ err: error }, "External resource stale-check failed"); }
    finally { running = false; }
  };
  const first = setTimeout(() => { void run(); }, 60000);
  const timer = setInterval(() => { void run(); }, 3600000);
  first.unref();
  timer.unref();
}
