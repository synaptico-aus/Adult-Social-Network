import { randomUUID } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, uploadAdmissionsTable as admissions } from "@workspace/db";

export const UPLOAD_LIMITS = Object.freeze({
  accountBytes: 512 * 1024 * 1024, globalBytes: 10 * 1024 ** 3,
  // Leave headroom in the API's default ten-connection pool while writers
  // retain a database lock through bounded I/O.
  accountInFlight: 3, globalInFlight: 8,
  accountDailyBytes: 1024 ** 3, globalDailyBytes: 10 * 1024 ** 3,
  accountDailyGrants: 500, globalDailyGrants: 10000,
  grantMs: 5 * 60000, receiveMs: 60000, storageMs: 60000,
});
export class UploadAdmissionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type UploadAdmission = typeof admissions.$inferSelect;
type AdmissionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** All issuers serialize here, across processes and media/profile routes. */
export async function reserveUpload(input: Pick<UploadAdmission, "ownerMemberId" | "resourceId" | "purpose" | "objectPath" | "contentType" | "byteSize">, transaction?: AdmissionTx) {
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > 200 * 1024 * 1024)
    throw new UploadAdmissionError(400, "Invalid upload byte count");
  const execute = async (tx: AdmissionTx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(170016)`);
    const [previous] = await tx.select().from(admissions).where(and(eq(admissions.objectPath, input.objectPath), ne(admissions.state, "released")));
    if (previous) {
      if (previous.ownerMemberId !== input.ownerMemberId || previous.byteSize !== input.byteSize || previous.contentType !== input.contentType)
        throw new UploadAdmissionError(409, "Upload recovery metadata does not match");
      if (previous.state === "stored") return null;
      if (previous.state !== "reserved" || previous.expiresAt <= new Date())
        throw new UploadAdmissionError(409, "Upload is active or awaiting cleanup");
      return uploadIngestionURL(previous.id);
    }
    // Expired/failed reservations remain charged until cleanup confirms deletion.
    // Released rows retain a conservative rolling-day issuance budget.
    const result = await tx.execute(sql`select
      coalesce(sum(byte_size) filter (where state <> 'released'),0)::bigint as bytes,
      coalesce(sum(byte_size) filter (where state <> 'released' and owner_member_id=${input.ownerMemberId}),0)::bigint as owner_bytes,
      count(*) filter (where state in ('reserved','receiving','cleanup'))::int as flights,
      count(*) filter (where state in ('reserved','receiving','cleanup') and owner_member_id=${input.ownerMemberId})::int as owner_flights,
      coalesce(sum(byte_size) filter (where created_at > now()-interval '24 hours'),0)::bigint as daily,
      coalesce(sum(byte_size) filter (where created_at > now()-interval '24 hours' and owner_member_id=${input.ownerMemberId}),0)::bigint as owner_daily,
      count(*) filter (where created_at > now()-interval '24 hours')::int as daily_grants,
      count(*) filter (where created_at > now()-interval '24 hours' and owner_member_id=${input.ownerMemberId})::int as owner_daily_grants
      from upload_admissions`);
    const n = result.rows[0] as Record<string, string | number>;
    if (Number(n.bytes) + input.byteSize > UPLOAD_LIMITS.globalBytes || Number(n.owner_bytes) + input.byteSize > UPLOAD_LIMITS.accountBytes ||
        Number(n.flights) >= UPLOAD_LIMITS.globalInFlight || Number(n.owner_flights) >= UPLOAD_LIMITS.accountInFlight ||
        Number(n.daily) + input.byteSize > UPLOAD_LIMITS.globalDailyBytes || Number(n.owner_daily) + input.byteSize > UPLOAD_LIMITS.accountDailyBytes ||
        Number(n.daily_grants) >= UPLOAD_LIMITS.globalDailyGrants || Number(n.owner_daily_grants) >= UPLOAD_LIMITS.accountDailyGrants)
      throw new UploadAdmissionError(429, "Upload capacity reached. Finish or cancel pending uploads, or try later.");
    const id = randomUUID();
    await tx.insert(admissions).values({ ...input, id, state: "reserved", expiresAt: new Date(Date.now() + UPLOAD_LIMITS.grantMs) });
    return uploadIngestionURL(id);
  };
  return transaction ? execute(transaction) : db.transaction(execute);
}
function uploadIngestionURL(id: string) {
  // API artifact is mounted at /api. No provider credential or write URL escapes.
  return `/api/uploads/${id}/bytes`;
}

/** Run deletion while holding the admission lock so a writer cannot recreate bytes. */
export async function retireUpload(resourceId: string, remove: (tx: AdmissionTx) => Promise<void>) {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(admissions).where(and(eq(admissions.resourceId, resourceId), ne(admissions.state, "released"))).for("update");
    await remove(tx);
    for (const row of rows) {
      // Stored means the bounded writer finished successfully. Other states may
      // hide a crashed write; retain charge and a second deletion deadline.
      await tx.update(admissions).set(row.state === "stored" ? { state: "released" } :
        { state: "cleanup", expiresAt: row.state === "cleanup" ? row.expiresAt : new Date(Date.now() + 10 * 60000) }).where(eq(admissions.id, row.id));
    }
  });
}
