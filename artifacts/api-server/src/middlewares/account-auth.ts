import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { withinRateLimit } from "../lib/account-policy";
import { db, membersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const requireAuth: RequestHandler = async (req, res, next) => {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const member = (await db.select({ active: membersTable.active }).from(membersTable).where(eq(membersTable.clerkUserId, userId)).limit(1))[0];
  if (member && !member.active) {
    res.status(403).json({ error: "Account authority is inactive" });
    return;
  }
  (req as unknown as Request & { userId: string }).userId = userId;
  next();
};

type Request = { userId?: string };

const buckets = new Map<string, { count: number; resetAt: number }>();
/** Test-only reset hook; never called by production request handling. */
export function resetRateLimitBuckets(): void {
  if (process.env.NODE_ENV === "test" || process.env.PHASE6_TEST === "1") buckets.clear();
}
/** Best-effort process-local limiter; keys contain no tokens or secrets. */
export function sensitiveRateLimit(limit = 20, windowMs = 60_000): RequestHandler {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (!withinRateLimit(bucket.count, limit)) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }
    next();
  };
}

/** Authenticated mutation/search limiter. The key is the verified Clerk user, never body identity. */
export function memberRateLimit(limit = 20, windowMs = 60_000, bucketName = "default"): RequestHandler {
  return (req, res, next) => {
    const userId = getAuth(req)?.userId;
    if (!userId) { next(); return; }
    const key = `member:${userId}:${bucketName}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) { buckets.set(key, { count: 1, resetAt: now + windowMs }); next(); return; }
    bucket.count += 1;
    if (!withinRateLimit(bucket.count, limit)) { res.status(429).json({ error: "Too many requests" }); return; }
    next();
  };
}