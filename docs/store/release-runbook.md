# Phase 18 release and review runbook

## Current boundary

**No submission or release authorised.** All output is preparation.
Phase 17 is NO-GO. There is a web/API product, not a native app. Do not ship a
thin WebView wrapper or claim an unsigned web build is an IPA/AAB. Creating a
genuine native client and verifying its full safety/account journeys is a
prerequisite, not work hidden by this checklist.

## Owner/account and signing dependencies

1. Identify the legal seller and obtain owner-controlled Apple Developer /
   App Store Connect and Google Play Console access with scoped roles, MFA,
   agreements and any required identity/organisation verification. Verify Play
   personal-versus-organisation account and creation date.
2. Owner chooses unique reverse-DNS bundle/package IDs using a domain they
   control. No guessed/reserved identifier is configured. Register actual app
   records and consistent capabilities, redirect/deep-link domains and push
   entitlements if needed. Confirm listing name availability.
3. Implement the native client. Reuse live private authorisation, source
   audiences, blocks, fresh staff MFA and account lifecycle. Do not broaden
   backend CORS or leak session tokens into URL parameters.
4. Pin a supported toolchain satisfying current Xcode 26/iOS 26 SDK and
   Android API 36 submission rules. Audit transitive native SDKs, privacy
   manifests/required reasons, merged Android permissions and release network
   traffic. Match supported device/OS claims to physical-device evidence.
5. Use owner-controlled signing/cloud key storage. Apple distribution
   certificate/provisioning/entitlements must match the app and team. For
   Google use the correct upload key and Play App Signing configuration;
   preserve recovery ownership. Never commit `.p12`, keystores, passwords,
   service-account files, recovery codes or reviewer credentials.
6. Produce signed release archives: verify Apple archive/distribution
   signature and entitlements, verify signed AAB and package/version/code.
   Record non-secret artifact checksum, source revision, tool versions and
   signing identity reference. Compare the tested and submitted build digests.
   No commands are supplied that pretend a nonexistent project can build.

Secrets must be entered through approved secrets/signing tooling, never chat,
source, a generated report or a public demo configuration.

## Assets and listing

`pnpm --filter @workspace/api-server store:assets` generates candidate opaque
1024px Apple / 512px Play icons, an adaptive foreground, and a **crimson
`#DC143C` splash asset** using purple/yellow Me branding. These are unapproved
artwork candidates, not a configured native splash or valid release bundle.
Use the native platform's supported launch-screen approach, safe areas and
Android system splash conventions; verify appearance on physical devices.
Do not add intentional startup delay. Native icon variants and appearance
requirements must be audited against the chosen SDK/OS.

Descriptions in `phase18.json` are drafts for enabled, verified features.
Remove draft wording only after the underlying claims pass. Do not advertise
reels/uploads while held, instant processor erasure, 24/7 support, treatment
benefits or guaranteed safety. Confirm operator copyright, support email,
public support/privacy/terms/community/child-safety/deletion URLs and review
contact. No placeholder address is a valid store contact.

Capture the actual native release candidate on each declared device family:
Simple View, chosen-audience text sharing, connection/group experience,
learning, messaging and account/privacy controls. Use isolated fictional
labelled accounts and rights-cleared content; no private messages, health
details, genuine-member images or staff secrets. Record platform/device/OS,
build digest, screen route, date and reviewer for every image. Consult official
dimensions at capture time. Web reference images are not native screenshots.

## Safe store-review access

- Provision a dedicated isolated environment or strictly enforced test tenant
  with synthetic identities/content and **no production member data**. Same
  native binary and code paths, real auth, normal permissions/reporting and
  genuine staff-MFA requirements; no secret URL, hardcoded password,
  `NODE_ENV=test`, reviewer bypass or silent feature unlock.
- Isolation must be demonstrated across database, storage, queues,
  notifications, collections and external processors. A “TEST” display name
  alone is not isolation. Do not copy real members to populate it.
- Provide the least-privileged synthetic ordinary-member account needed for
  review, labelled fictional counterpart accounts and guided steps. Explain
  policy acceptance/age test-data handling. If privileged workflow review is
  necessary, arrange separately scoped access without defeating MFA.
- Put time-limited credentials/instructions **only in the private store
  console review fields** or a store-approved secure process. Do not paste
  them here. Test reviewer access from a fresh device/region without a
  developer's session or unresolvable SMS challenge. Do not disable MFA on
  real accounts to make review easier.
- Me must actually function for reviewers. Its current onboarding and upload
  holds must not be hidden from review or bypassed; resolve blockers and
  honestly explain enabled/disabled scope before submission.
- Make an owner-authorised stable HTTPS review backend available for the
  entire review window, with correct auth/callback/storage/CORS/certificates.
  A development preview is neither production availability nor a reliable
  review endpoint. Verify dependencies and health externally without exposing
  private media or administration. No backend was published in this phase.
- Record isolation verification, credential expiry/rotation owner, monitored
  review window and post-review cleanup via normal deletion. Do not log secrets
  or delete real accounts when cleaning fixtures.

## Test and readiness evidence

1. Internal TestFlight and Android internal testing after gates/signing; then
   consented external beta/closed testing with required beta review and any
   account-specific Play 12-testers/14-continuous-days requirement. Do not claim
   compliance from invitations alone. Store test distribution also needs
   explicit owner authorisation.
2. Use physical iOS/Android devices for all Phase 17 personas, accessibility,
   uploads, codecs, unreliable networks, interrupted/recovered operations,
   notification permissions and actual OS background/foreground/termination.
   Browser mobile emulation and simulator-only checks do not substitute.
3. Recheck desktop supported browsers and full account/permission/deletion
   journeys after policies reopen onboarding. Existing Phase 17 public-only
   results remain limited evidence; do not relabel them native or complete.
4. Confirm a privacy-reviewed crash solution before introducing any SDK:
   redact content/health data, tokens and identifiers; no automatic screenshots,
   session replay or message breadcrumbs. Symbolicate a synthetic release
   crash; send a test alert, acknowledge it and document retention/access.
   Server operational counters are not proof of native crash reporting.
5. Name staffed hours, safety/review coverage, actual incident and child-safety
   contacts, urgent escalation and review-window availability. Exercise an
   alert and incident handoff. Do not claim 24/7 without evidence.
6. Complete independent human security, real-user accessibility, deletion,
   backup restoration and Phase 17 measured targets. Reconcile remaining high
   dependency/storage findings. Retain incomplete-feature holds.

## Owner-controlled rollout and recovery

Start with **no approved countries** until regional privacy/legal, age
assurance, resources, support and moderation are evidenced. Only the three
implemented English formats are candidates; an English format is not new
language moderation coverage. Do not assume the user's time zone determines
launch countries. No automatic worldwide default.

After gates, owner chooses internal beta, controlled consented closed beta,
then a manual public-release decision for named regions/languages. Select
manual release / managed publishing controls as applicable and check exact
store support for the first release versus later staged/phased updates.
Do not promise a percentage rollout feature applies to a first release.
Before each expansion compare measured crash/error/latency, moderation backlog
and support coverage to the predeclared targets and get owner approval.

Record a tested recovery plan: disable affected features server-side, halt
test/rollout as appropriate, preserve access/deletion/reporting, restore
verified backups in isolation, use backwards-compatible API/schema changes and
prepare a signed forward-fix. Halting a rollout does not uninstall or downgrade
already installed copies; do not promise instant binary rollback.

## Private review-notes template — do not submit yet

- Exact app/build IDs and signed digest: **not available**.
- Intended adults and purpose: social connection for adults living with
  dementia, carers and other adult members; 18+ Me eligibility is distinct
  from the store's rating; not diagnosis/treatment/emergency service.
- Enabled/held features and steps: attach verified release-specific list.
- Synthetic account access: enter only in private review fields after genuine
  isolation verification, never in this document.
- Stable review backend and availability/contact: **not configured**.
- Deletion path/status/retention and sign-in provider assessment: attach
  verified results, including Apple token revocation if applicable.
- Policy URLs, child-safety contact and staffed support: **await owner/review**.
- Purchases: none enabled; no hidden paid features.
- Submission/release authorisation: **not given**.
