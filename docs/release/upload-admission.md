# Bounded upload admission

## Release status

**Uploads remain held.** No operational switch overrides the upload release hold.
This change addresses storage admission, not malware or content screening, human
approval, production capacity certification, or removal of any release hold.

## Transfer boundary

Both media and profile-photo requests now return an owner-authenticated API URL,
not a signed storage PUT URL. Each reservation is single-use and expires after
five minutes. The API checks the declared content type, rejects encoded bodies,
and accepts exactly the reserved byte count into a private, server-generated
temporary file. It does not trust Content-Length: chunked bodies are counted too.
An oversized, short, interrupted or timed-out transfer never reaches App Storage.
Untrusted bytes are not decoded in this admission step.
EOF waits for every staging write to succeed. The staging file's size is checked
both on its open handle and, independently, after closing it at the storage
writer boundary. A delayed or failed final disk write cannot admit a partial file.

Only after EOF and exact-size verification does the server write to private App
Storage. The write uses the installed GCS SDK's non-resumable writer, a
create-only generation precondition, a dedicated retry-disabled client, and a
60-second abort deadline. No unsupported sidecar parameters or provider
content-length claims are used. Receiving has a separate 60-second total
deadline, not an inactivity timer that clients can reset.

Admission does not publish content or bypass completion, immutable-source
freezing, private delivery, malware scanning, or the existing video workflow.
Profile delivery remains owner-scoped. The global upload hold also covers the
new byte-ingestion route.

## Shared quotas

All API processes and both upload purposes share PostgreSQL reservations.
Issuance holds one global transaction advisory lock through quota checks and
reservation creation; media asset creation is in that same transaction.

Conservative initial limits, enforced by source-controlled constants:

| Allowance | Per account | Global |
| --- | ---: | ---: |
| Outstanding admitted input bytes | 512 MiB | 10 GiB |
| Pending/in-flight/uncertain-cleanup grants | 3 | 8 |
| Reserved bytes issued in a rolling 24 hours | 1 GiB | 10 GiB |
| Grants issued in a rolling 24 hours | 500 | 10,000 |

Existing per-file type/size limits still apply (profile photos 5 MiB; media
photos 10 MiB; audio 50 MiB; reels 64 MiB; video posts 200 MiB).
Stored input stays charged until its resource is deleted. The daily issuance
ledger is not refunded by cancellation or failed transfers, preventing churn
from resetting the cost allowance. Idempotent recovery reuses a reservation
without renewing its deadline or double-reserving. Recovery after a successful
transfer returns no write URL; clients proceed to completion instead.

These quotas account for newly admitted input, not a complete inventory of
historical storage or the size of generated derivatives. They are not a billing
estimate. Historical files and derivative amplification still need to be
included in an independently approved operational storage budget before release.

## Races, interruption and cleanup

The admission row is locked throughout staging and writing. Replay on another
process is refused. Cancellation, profile attachment, account deletion and
cleanup coordinate with the same lock. Media cancellation retains its existing
attachment and retained-evidence checks; retry cannot reset a cancelled status.

Cleanup accounting survives account/asset deletion without cascading foreign
keys. Deletion must succeed before capacity is released. An ambiguous failed or
crashed writer leaves its charge in place and schedules a second deletion after
a ten-minute uncertainty window, longer than the bounded writer deadline.
Expired grants and unattached profile photos are cleaned; stored media cleanup
continues through the existing evidence-aware resource cleanup.
Stored-media reservations always defer to that resource lifecycle while the
asset exists, even after account deactivation/deletion; retained sources remain
present and charged. Admission cleanup must never interpret an inactive owner as
permission to erase evidence.
Unattached completed photos expire after 24 hours. Process-crash staging directories older
than 15 minutes are reaped. Cleanup failures are logged and retain capacity.
Released accounting rows are kept for at least the rolling-day budget window.

Previously issued signed URLs cannot be revoked by this code change. Before any
future reopening, independently confirm that old writers are gone, their grants
have expired, and historical staging cleanup has completed.

## Verification

The regression suite exercises actual HTTP transfers against two independent OS
processes using the shared database and a test-only private-storage adapter:

- Oversized Content-Length and chunked transfers for media and profile photos
  return 413 with no stored bytes.
- Unowned writes fail; concurrent writes consume one grant at most.
- Cross-process idempotent requests create one media asset and one reservation.
- Account/global slot and aggregate-byte races cannot exceed their allowance.
- Exact transfers stay private and require completion; recovery cannot re-PUT.
- Expiry, cancellation, failed deletion and successful cleanup retain/release
  charges as appropriate; rolling issuance budgets survive release.
- Staging rejects truncated and encoded bodies and stops a slow transfer at its
  total deadline.
- EOF cannot advance to storage while the final staging write is delayed, and
  a final write failure after EOF refuses admission rather than returning 204.
- Account deactivation and the evidence-aware media deletion hook preserve
  reported photo/audio sources; a subsequent admission sweep neither deletes
  their bytes nor releases their reservations.

The existing media suite now transfers its synthetic files through ingestion,
then checks scanning, immutable sources, cancellation and deletion regressions.

Reproduce while the managed API workers are paused. Test files run serially
because they share aggregate database budgets; requests within the admission
tests still race across two independent API processes:

```sh
NODE_ENV=test pnpm --filter @workspace/api-server exec tsx --test \
  --test-concurrency=1 src/lib/*.test.ts src/routes/*.test.ts
```

These are development integration results, not real-provider outage, production
billing, proxy buffering, independent human approval or authenticated capacity
evidence. Such evidence remains a release prerequisite; this work does not
authorize reopening uploads.
