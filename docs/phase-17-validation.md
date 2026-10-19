# Phase 17: release validation and controlled beta

## Current decision: NO-GO for wider release

This is a development validation programme, not an approval or certification.
Five persona journeys on desktop and **physical native iOS/Android** are required.
The current registered product is a web app; no native build or physical device
has been supplied. A narrow browser viewport is not native-device testing.
No actual dementia/carer participants, participant consent, external human
security review, staffed support sample or isolated backup restoration have
been supplied. Do not mark these passed.

Use `docs/release/phase17-evidence.json` as the owned issue/evidence register.
Run `pnpm --filter @workspace/scripts release:check` to regenerate the report.
An exit code of **1 is the expected NO-GO result**, not a crashed test.
Generated reports are under ignored `generated-artifacts/phase17/`.
Even complete records return READY FOR INDEPENDENT SIGN-OFF, never automatic GO.
Evidence expires after 30 days; re-run affected checks after material changes.
References and owner-role assignments are not verified reviewer signatures.

### What was actually observed

- The initial isolated full backend suite passed **152/152** before remediation.
- After changes, the full isolated suite passed **156/156**; the strengthened
  messaging file passed **14/14**, release-policy tests **5/5**, and client
  reauthentication tests **2/2**. Type checks passed. The extra message test found
  an overbroad database uniqueness rule that rejected a second distinct concern;
  the non-unique lookup index now permits separately report-scoped evidence.
  Final affected post/report, messaging and admission checks passed **30/30**,
  including missing-target attribution and wrong-author rejection.
- The AI code reviewer identified unbounded direct-to-storage PUT grants and
  report queue flooding. This review is **not independent human approval**.
- Dependency baseline: 1 critical, 13 high, 11 moderate, 2 low advisories.
  Compatible updates and scoped transitive overrides removed the critical
  finding and reduced remaining high findings to one. See the final scan record.
  Do not equate advisory severity with proven exploitability.
- SAST and privacy/dataflow scanners initially returned no findings; these tools
  cannot prove security or privacy compliance.
- One explicitly synthetic Clerk desktop account reached onboarding. The tester
  refused to accept policies that were not available to read. Browser evidence:
  `3qp5pq`. The remaining signed-in journey is **blocked**, not passed.
- Production database discovery reported **no production database**. No production
  fixture deletion, database restore or data alteration was performed.
- The same synthetic browser session verified the paused onboarding screen, then
  signed out. Local axe on two public pages at desktop/390px found one moderate
  viewport-zoom restriction; it was removed. Input help/error descriptions were
  added to security reporting. No full WCAG claim or real-user review is made.
  Narrow pages had no horizontal overflow; mobile navigation density remains
  owned follow-up work. Public slow reload worked; offline hard reload showed the
  browser network error. Authenticated draft recovery was not reached.
- Public development smoke: 84 requests, zero unexpected failures, p50 8ms/p95
  25ms at four concurrent public reads. This is explicitly **not** a representative
  authenticated/media capacity assessment and satisfies none of those targets.
- One synthetic Clerk identity remains signed out pending permitted cleanup;
  no provider deletion mechanism was available to the tester. Do not count that
  as an account deletion success or production fixture removal.
- Remaining observed results belong in the evidence register and generated
  go/no-go report; do not infer native, human or production coverage from tests.

## Remediation and deliberate shutdowns

- Report intake for both public-content/member reports and private-message
  reports shares atomic PostgreSQL member allowances: 20/minute and 100/day,
  fixed windows across API replicas. Denial includes Retry-After; database failure
  returns an explicit unavailable response, not a successful receipt.
- Within 10 minutes, an identical report from the same member, target, category
  **and details** reuses its case/evidence after current authority checks.
  Different categories or details are not silently discarded. Intake does not
  accept a different supplied target author for reported content.
- Rate-counter identities are hashed, carry no text/health data, expire after
  seven days in the operational worker and are erased by the account lifecycle
  hook. The previous general process-local limiters elsewhere in the app remain
  best-effort: a full distributed rate-limit review is still required.
- **All new uploads (including profile photos) and video processing are paused**
  outside synthetic test execution. No staff feature toggle overrides the
  code-level hold. Previously issued signed PUTs may remain usable until their
  short expiry; previously uploaded objects need lifecycle cleanup. This contains
  the new-grant storage abuse path; it does not fix storage-side size enforcement,
  aggregate admission, or retroactively revoke an outstanding storage grant.
- **New onboarding is paused** in both UI and API until version-bound current
  policies are readable and independently reviewed. No policy text, approval,
  participant consent or staff MFA was fabricated.
- Synthetic integration tests may exercise held pipelines only in NODE_ENV=test;
  the test storage adapter is prohibited outside that environment. Never deploy
  with NODE_ENV=test or expose test auth injection as an HTTP setting.

## Before involving people

**Accountable owner: consented beta research lead (person must be appointed).**

1. Approve a plain-language participant information sheet, privacy/data-use basis,
   study scope, withdrawal process, safeguarding/incident contact and support hours.
   Obtain explicit voluntary participation and recording consent separately.
2. Agree an ethical capacity/consent process with qualified advisers. Do not infer
   that a diagnosis removes capacity or that a family carer may automatically
   consent for another person. Offer a support person, short sessions and breaks.
3. Recruit consenting people living with dementia and family carers as distinct
   groups. Use ordinary members, trained group moderators and education editors
   with legitimately enrolled MFA for the other journeys.
4. Use labelled TEST accounts in a restricted staging environment with synthetic
   stories, images and audio; no real diagnosis/health history or private messages
   are required. Do not contact real members, simulate real staff replies or
   create false education approvals.
5. Record consent using a secure approved system. The public evidence register
   stores only an opaque evidence reference, role, method, date and outcome:
   **no participant identity, consent signatures, session tokens or private text**.
6. Let people stop, skip or withdraw without penalty. Record task difficulty,
   needed help and optional feeling-supported feedback; do not clinically score
   memory or treat task completion as a cognitive assessment.

## Journey matrix and acceptance checks

Run the following bundle for each of the five personas on desktop and physical
iOS/Android; capture build, OS/browser, assistive technology, language, time zone,
network and synthetic account label. Mark inapplicable privileged actions denied,
not granted. A bundle passes only when every applicable step is evidenced.

| Step | Positive and negative checks |
|---|---|
| Onboarding | Read actual current versioned documents before deliberate consent; adult self-declaration accurately described; cancel/reload; no hidden acceptance or diagnosis request. |
| Simple View | Toggle, persist after reload; fewer choices without losing essential safety/privacy/account controls; keyboard, screen reader and touch navigation. |
| Connection | Send/accept/cancel a TEST request; relationship IDs not profile IDs; reject foreign-account actions and duplicate races; blocks revoke both directions. |
| Posting | Recover own draft after disconnect/reload; choose audience deliberately; pending/held material is not published; edit invalidates prior moderation approval. |
| Circle sharing | Only permitted members see original content; remove/rejoin member and revoke source audience; stale collections/media/share links must not regain access. |
| Group welcome | Approval/owner/trained-host boundaries; welcome request/availability truthful; no claim of human response until a trained human actually responds. Group moderator cannot act outside assigned groups. |
| Learning | Only current independently reviewed education is published; editor cannot self-approve/publish or read moderation evidence; translations retain original/version and review. |
| Messaging | Contact permissions, accept/decline, block and leave; attachments use live private authorisation; account switch clears old caches/drafts; no recipient notification after authority revocation. |
| Reporting | Accurate receipt vs human acknowledgement; bounded distinct reports, duplicate reuse, reason-scoped staff evidence; appeal remains available under sanctions. |
| Account export/deletion | Own data/rights-only downloads; genuine recent verification before irreversible deletion; clear caches/tokens, immediate inactive authority, tracked pending processors/backup/evidence exceptions. No fake completion. |

For the dementia/carer sessions, examine understandable audience labels, font
legibility, pause/recovery and availability of help without implying clinical
benefit. For ordinary members, demonstrate staff denial. For group moderators,
show allowed assigned-group actions and denial of global/other-group data. For
education editors, show independent review/publication and moderation-data denial.

## Security and accessibility

**Owners: independent security reviewer and accessibility/research leads.**

- Commission an external qualified reviewer with defined scope, evidence handling,
  retest and sign-off. The AI review and automated scans are preparation only.
- Exercise cross-account IDs, concurrent audience/block/unfriend/remove changes,
  saves/collections/shares, staff capability + group scope + fresh MFA, private
  variants/ranges/transcripts/exports, stale/signed storage links, SSRF redirects/
  DNS, upload/report/auth rate limits and recovery/deactivation.
- Existing API regression suites cover these boundaries using labelled synthetic
  identities and injected test auth. They are not real browser or staff-MFA proof.
- Run local axe-core on reachable page states, automated contrast/names/landmarks,
  keyboard-only operation, visible focus and errors; verify 200% text zoom,
  320/390px reflow, target size, reduced motion, Simple View and RTL.
- Review with consenting real users, including screen readers, VoiceOver and
  TalkBack. An automated pass is not accessibility conformance.
- Yellow text must remain on a dark text-bearing surface; white empty margins
  are acceptable. Do not place yellow labels directly onto the white canvas.

## Load, network, media and OS lifecycle protocol

**Owners: performance/media engineering and mobile QA leads.**

Targets are in `docs/release/phase17-targets.json` and were set before capacity
assessment. They are proposed acceptance criteria, not measured service promises.
Do not silently relax targets after a failure. Record sample size and missing
coverage. Public development smoke measurements are not representative capacity.

1. Prepare isolated representative staging with approved test identities and a
   rights-cleared synthetic corpus: small/near-limit JPEG/PNG/WebP, voice audio,
   silent/audible portrait and landscape reels/posts, invalid/truncated/oversized
   sources and exact duration boundaries. Never use copyrighted music without rights.
2. After storage admission and screening are independently verified, load 20
   concurrent authenticated users for 15 minutes, >=1,000 requests; exercise
   feed, audience filtering, message reads, private media seeking and cleanup.
   Record p50/p95/p99, unexpected failure %, CPU/memory, worker queue age,
   processed bytes, storage/egress cost and success by platform. No real-user
   media or production stress test.
3. Emulate 1.6Mbps down/150ms RTT, low-data defaults, mid-transfer disconnect,
   interrupted retry, airplane mode, expired session and account switch.
   Confirm explicit errors, no duplicate publication, own recoverable drafts,
   byte limits and fresh permission checks after recovery.
4. On **physical devices**, background/foreground, lock/unlock, audio interruption,
   browser/app termination, Wi-Fi/cellular switch and OS memory pressure.
   Foregrounding must not resume playback without permission; captions,
   pause/mute and visible Next/Previous remain usable.
5. Never call pagehide/visibilitychange tests proof of actual OS lifecycle.
   Do not enable video merely because thumbnail or frame sampling passes.

## Moderation backlog and support coverage

**Owner: safety operations lead.**

Use a controlled staging burst of 100 distinct ordinary and 10 distinct urgent
synthetic reports from multiple approved TEST accounts, without bypassing normal
rate limits. Confirm priority and independent scoped triage, audit/evidence
protection, first *human* response, owner handoff, missed-window escalation and
external alert acknowledgement. Receipt and active browser heartbeat are not
human response. Measure out-of-hours gaps separately and publish actual hours.
No 24/7 claim without an evidenced roster and observed coverage.

## Backup, recovery and production fixture checks

**Owners: recovery operations lead and release lead.**

- Obtain actual provider backup retention/expiry, isolated restore access,
  compatible release/schema, rollback plan and authorisation. Never overwrite
  production to satisfy a test.
- In an isolated clone create owned synthetic sentinels, record restore point,
  delete one account and revoke a circle/block/media permission after backup.
  Restore, replay the post-backup deletion/revocation ledger **before access is
  opened**, invalidate caches/tokens and verify every registered module and
  playback asset still denies removed authority. Measure RPO/RTO.
- Record failure recovery, processor deletion state, evidence/legal hold
  exceptions and expiry; retain minimal reviewed evidence only.
- No production database currently exists. When an actual release target exists,
  use a read-only inventory plus the test-run ownership manifest. A name containing
  “test” is not sufficient authority to delete a real person's account.
- Remove only positively identified owned fixtures through registered lifecycle
  hooks, with retention/hold checks, provider cleanup and proof. Require approved
  exact scope before destructive cleanup. Do not bulk DELETE by prefix, seed
  production with test accounts or include fixture loaders in startup.

## Repeatable checks

```sh
# Pause the managed development API before shared-DB media integration tests,
# then restore that exact managed workflow. Never test against production.
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/scripts release:test
pnpm --filter @workspace/scripts release:smoke  # bounded, public dev routes only
pnpm --filter @workspace/scripts release:check  # currently expected exit 1 / NO-GO
```

Appoint named people for the owner roles, attach genuine evidence, fix/retest all
critical/high issues and obtain independent final sign-off. Incomplete journeys,
unavailable devices, policy documents, review/staffing/backup evidence and
unpatched advisories remain launch blockers, not an automatic success label.
