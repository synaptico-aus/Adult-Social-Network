import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, operationalCountersTable } from "@workspace/db";
import type { RequestHandler } from "express";
import { getAuth } from "@clerk/express";

export const rateSubject = (userId: string) => createHash("sha256").update(userId).digest("hex");

/** Atomic, shared across API replicas. No private content or raw identity in keys. */
export async function takeRateSlot(userId: string, bucket: string, limit: number, windowMs: number, now = Date.now()) {
  const start = Math.floor(now / windowMs) * windowMs;
  const key = `rate:${rateSubject(userId)}:${bucket}:${start}`;
  const rows = await db.insert(operationalCountersTable).values({ key, count: 1 })
    .onConflictDoUpdate({ target: operationalCountersTable.key,
      set: { count: sql`${operationalCountersTable.count} + 1`, updatedAt: new Date(now) },
      setWhere: sql`${operationalCountersTable.count} < ${limit}` })
    .returning({ count: operationalCountersTable.count });
  return { allowed: rows.length > 0, retryAfter: Math.max(1, Math.ceil((start + windowMs - now) / 1000)) };
}

/** Both report routes share these limits. Failure pauses intake explicitly, not silently. */
export const reportRateLimit: RequestHandler = async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) { next(); return; }
  try {
    for (const [bucket, limit, windowMs] of [["reports-minute", 20, 60_000], ["reports-day", 100, 86_400_000]] as const) {
      const slot = await takeRateSlot(userId, bucket, limit, windowMs);
      if (!slot.allowed) {
        res.set("Retry-After", String(slot.retryAfter));
        res.status(429).json({ error: "Report limit reached. Please wait before sending another report. Me is not an emergency service." });
        return;
      }
    }
    next();
  } catch {
    res.status(503).json({ error: "Reports could not be accepted. Please try again; Me is not an emergency service." });
  }
};
