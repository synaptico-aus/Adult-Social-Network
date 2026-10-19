import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createClerkClient } from "@clerk/backend";
import { db, pool, deletionRequestsTable, deletionStepsTable, membersTable, mediaAssetsTable, mediaCleanupTasksTable, retainedEvidenceTable, memberConsentsTable, consentHistoryTable, verificationRequestsTable, operationsRecordsTable } from "@workspace/db";
import { listDeletionHooks, runDeletionHooks } from "./deletion-hooks";
import { logger } from "./logger";

let deletionBusy = false;
export async function executeDeletion(requestId: string, identity = false) {
  // One local job preserves pool headroom; a database advisory lock also excludes other replicas.
  if (deletionBusy) return;
  deletionBusy = true;
  let client: { query(text: string, values: string[]): Promise<{ rows: { acquired?: boolean }[] }>; release(): void } | undefined, locked = false;
  try {
    client = await pool.connect();
    locked = (await client.query("select pg_try_advisory_lock(hashtextextended($1,0)) as acquired", [requestId])).rows[0].acquired === true;
    if (locked) await executeDeletionUnlocked(requestId, identity);
  } finally {
    try { if (locked && client) await client.query("select pg_advisory_unlock(hashtextextended($1,0))", [requestId]); }
    finally { client?.release(); deletionBusy = false; }
  }
}
async function executeDeletionUnlocked(requestId: string, identity: boolean) {
  const [request] = await db.select().from(deletionRequestsTable).where(eq(deletionRequestsTable.id, requestId));
  if (!request || request.status !== "pending") return;
  await runDeletionHooks({ memberId: request.memberId, requestId }, async (module, run) => {
    const id = `${requestId}:${module}`;
    const [before] = await db.select().from(deletionStepsTable).where(eq(deletionStepsTable.id, id));
    if (before?.status === "completed" || (before?.attempts ?? 0) >= 5) return;
    await db.insert(deletionStepsTable).values({ id, requestId, memberId: request.memberId, module, status: "running", attempts: 1 })
      .onConflictDoUpdate({ target: deletionStepsTable.id, set: { status: "running", attempts: sql`${deletionStepsTable.attempts}+1`, updatedAt: new Date() } });
    try { await run(); await db.update(deletionStepsTable).set({ status: "completed", errorCode: null, updatedAt: new Date() }).where(eq(deletionStepsTable.id, id)); }
    catch { await db.update(deletionStepsTable).set({ status: "failed", errorCode: "module_cleanup_failed", updatedAt: new Date() }).where(eq(deletionStepsTable.id, id)); }
  });
  const memberId = request.memberId;
  await db.delete(memberConsentsTable).where(eq(memberConsentsTable.memberId, memberId));
  await db.delete(consentHistoryTable).where(eq(consentHistoryTable.memberId, memberId));
  await db.delete(verificationRequestsTable).where(eq(verificationRequestsTable.memberId, memberId));
  const assets = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.ownerMemberId, memberId));
  const cleanup = await db.select().from(mediaCleanupTasksTable).where(sql`${mediaCleanupTasksTable.assetId} = ${`profile:${memberId}`} or ${mediaCleanupTasksTable.assetId} in (select id from media_assets where owner_member_id=${memberId}) or ${mediaCleanupTasksTable.paths}::text like ${`%/${memberId}/%`}`);
  const retained = await db.select().from(retainedEvidenceTable).where(eq(retainedEvidenceTable.authorMemberId, memberId));
  const [owner] = await db.select().from(membersTable).where(eq(membersTable.id, memberId));
  const footprint = owner && await db.execute(sql`select (
    exists(select 1 from sensitive_action_audit where actor_clerk_user_id=${owner.clerkUserId})
    or exists(select 1 from message_reports where reporter_member_id=${memberId})
    or exists(select 1 from message_report_context where sender_member_id=${memberId})
    or exists(select 1 from reports where reporter_member_id=${memberId})
  ) as retained`);
  const externalSteps = ["clerk", "storage", "database_backups", "logs", "evidence_retention"];
  for (const provider of externalSteps) {
    const [prior] = await db.select().from(deletionStepsTable).where(and(eq(deletionStepsTable.requestId, requestId), eq(deletionStepsTable.module, `processor:${provider}`)));
    let attempts = prior?.attempts ?? 0;
    let complete = provider === "storage" ? !assets.length && !cleanup.length : provider === "evidence_retention" ? !retained.length && !footprint?.rows[0]?.retained : false;
    if (provider === "clerk" && identity && prior?.status !== "completed" && attempts < 5) {
      attempts += 1;
      const [member] = await db.select().from(membersTable).where(eq(membersTable.id, memberId));
      if (member) try { await createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? "" }).users.deleteUser(member.clerkUserId); complete = true; }
      catch (e) { complete = (e as { status?: number }).status === 404; }
    }
    if (prior?.status === "completed" && !["storage", "evidence_retention"].includes(provider)) complete = true;
    // A qualified operator may attest provider completion with request-specific evidence.
    const proof = await db.select().from(operationsRecordsTable).where(and(eq(operationsRecordsTable.kind, "processors"), eq(operationsRecordsTable.targetId, requestId), eq(operationsRecordsTable.title, provider), eq(operationsRecordsTable.status, "verified")));
    // An attestation must never override objects or retained evidence that still exist.
    if (!["storage", "evidence_retention"].includes(provider) && proof.some(p => !!p.reference && !!p.validUntil && p.validUntil > new Date())) complete = true;
    const status = complete ? "completed" : provider === "evidence_retention" ? "retention_review_required" : attempts >= 5 ? "manual_retry_required" : "awaiting_processor";
    await db.insert(deletionStepsTable).values({ id: `${requestId}:processor:${provider}`, requestId, memberId, module: `processor:${provider}`, status, attempts })
      .onConflictDoUpdate({ target: deletionStepsTable.id, set: { status, attempts, updatedAt: new Date() } });
  }
  const steps = await db.select().from(deletionStepsTable).where(eq(deletionStepsTable.requestId, requestId));
  if (steps.length === listDeletionHooks().length + externalSteps.length && steps.every(s => s.status === "completed")) {
    // Minimal deny-list tombstone persists until reviewed compliance policy permits erasure.
    await db.update(membersTable).set({ ageEligible: null, ageEligibilityMethod: null, agePolicyVersion: null, ageCheckedAt: null, emailVerified: false }).where(eq(membersTable.id, memberId));
    await db.update(deletionRequestsTable).set({ status: "completed", completedAt: new Date(), lastError: null }).where(eq(deletionRequestsTable.id, requestId));
  } else await db.update(deletionRequestsTable).set({ lastError: "Cleanup or justified retention/provider evidence remains outstanding" }).where(eq(deletionRequestsTable.id, requestId));
}
export function startDeletionWorker() {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return; busy = true;
    try { const requests = await db.select().from(deletionRequestsTable).where(eq(deletionRequestsTable.status, "pending")).limit(10);
      for (const request of requests) await executeDeletion(request.id, true);
    } catch { logger.error("Deletion worker failed; requests remain pending"); }
    finally { busy = false; }
  }, 60000);
  timer.unref();
}
