import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, featureControlsTable, operationsRecordsTable } from "@workspace/db";
import { operationalMetrics } from "./operations-metrics";
import { budgetDefaults } from "./operations-policy";
import { logger } from "./logger";

export async function checkOperationalBudgets() {
  const metrics = await operationalMetrics();
  for (const [key, defaultValue] of Object.entries(budgetDefaults)) {
    const [setting] = await db.select().from(operationsRecordsTable).where(and(eq(operationsRecordsTable.kind, "budgets"), eq(operationsRecordsTable.title, key))).orderBy(desc(operationsRecordsTable.createdAt)).limit(1);
    const threshold = setting?.numericValue ?? defaultValue, measured = metrics.find(m => m.key === key)?.value;
    if (measured == null || measured < threshold) continue;
    const id = `budget-alert:${key}`;
    await db.insert(operationsRecordsTable).values({ id, kind: "alerts", title: `${key} threshold exceeded`, note: `Observed ${measured}; threshold ${threshold}. In-app alert only: external on-call delivery is not configured.`, status: "open", actorClerkUserId: "system:monitor" })
      .onConflictDoUpdate({ target: operationsRecordsTable.id, set: { status: "open", note: `Observed ${measured}; threshold ${threshold}. External on-call delivery is not configured.` } });
    if (["storage_bytes", "upload_daily_bytes", "cost_usd_monthly"].includes(key)) {
      await db.insert(featureControlsTable).values({ key: "uploads", enabled: false, reason: `Automatic safety shutdown: ${key} budget reached`, updatedBy: "system:monitor" })
        .onConflictDoUpdate({ target: featureControlsTable.key, set: { enabled: false, reason: `Automatic safety shutdown: ${key} budget reached`, updatedBy: "system:monitor", updatedAt: new Date() } });
    }
    logger.warn({ metric: key, observed: measured, threshold }, "Operational threshold exceeded; external alert delivery unconfigured");
  }
}
export function startOperationalMonitor() {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return; busy = true;
    try { await checkOperationalBudgets(); }
    catch { logger.error("Operational monitor failed; external alert delivery is not configured"); }
    finally { busy = false; }
  }, 60000);
  timer.unref();
}
