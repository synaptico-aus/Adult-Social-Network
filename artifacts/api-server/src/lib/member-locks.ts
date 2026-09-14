import { sql } from "drizzle-orm";

type AdvisoryLockTransaction = {
  execute: (query: unknown) => Promise<unknown>;
};

export function memberPair(a: string, b: string): readonly [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Every operation which changes the relationship between two members uses this
 * lock.  Sorting both the pair and the collection of pairs makes the lock
 * order independent of request direction.
 */
export async function lockMemberPair(tx: AdvisoryLockTransaction, a: string, b: string) {
  const [left, right] = memberPair(a, b);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${left + ":" + right}, 0))`);
}

export async function lockMemberPairs(tx: AdvisoryLockTransaction, pairs: Array<readonly [string, string]>) {
  const unique = new Map<string, readonly [string, string]>();
  for (const [a, b] of pairs) {
    if (a === b) continue;
    const pair = memberPair(a, b);
    unique.set(`${pair[0]}:${pair[1]}`, pair);
  }
  for (const pair of [...unique.values()].sort(([a, b], [c, d]) => `${a}:${b}`.localeCompare(`${c}:${d}`))) {
    await lockMemberPair(tx, pair[0], pair[1]);
  }
}

/** Coarse authority lock shared by group lifecycle and linked conversations. */
export async function lockGroupAuthority(tx: AdvisoryLockTransaction, groupId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"group-authority:" + groupId}, 0))`);
}