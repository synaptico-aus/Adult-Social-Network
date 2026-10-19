# Actual collection and disclosure worksheet — not filed

Checked against the current web/API source on 19 October 2026. Generate
`pnpm --filter @workspace/scripts store:prepare` for installed direct package
versions and paths. **Native SDKs, final App Privacy answers and Play Data
safety remain blocked until a native binary, network trace and processor
contracts are reviewed.** Do not select “no data collected”.

## Data map

| Actual data/flow | Initial Apple / Google mapping | Use, linkage and remaining decisions |
|---|---|---|
| Preferred name, Clerk authentication/account identifiers, verified-email state, profile | Contact info / Personal info; User ID / identifiers | Account functionality/security, linked to account. Confirm actual sign-in email/phone/name fields and providers in production Clerk settings. No phone collection inferred merely from SDK capability. |
| Profile dementia connection, roles, biography and voluntarily supplied health content | Health + Other User Content / Health info and user-generated content | Health topics can be personal/sensitive even without HealthKit, diagnosis or a health-record integration. Private text is NOT analytics. Review field-level audience and optionality. Do not claim exemption because content is voluntary. |
| Stories, comments, groups, messages and Memory Collections | Other User Content / other UGC; messages / messages | Functionality/moderation; account-linked. Private-source permissions apply inside collections and external shares. Staff evidence has separately justified retention/access. |
| Photos, video, voice/audio, captions and media derivatives | Photos or Videos; Audio Data / photos, videos, audio | Account-linked functionality/safety. New uploads/processing paused, but existing data and enabled playback still count. Thumbnails are not full-video screening. |
| Chosen broad region/country, locale, time zone | Coarse Location or Other Data / approximate location or personal info, subject to actual field semantics | User-selected, not a claim of GPS collection. Assess store definitions before filing. No precise-location API is implemented. Country cannot be inferred from language. |
| Connection/circle/group relationships, blocks, saves, reports, age eligibility, policy consent | Other User Content, Product Interaction, Other Data / app activity and personal info as applicable | Functionality, safety and account access. Age eligibility is an adult attestation, not verified identity or a birth date. Do not invent collection of DOB. |
| Optional support-feedback booleans, task codes, durations and completion events | Product Interaction / app interactions; performance as applicable | Optional measurement currently off by default. Account-linked measurements are not anonymous merely because health text is excluded. Reconcile any enabling change before filing. |
| Operational request/error counters, route/request identifiers, security audit and server logs | Diagnostics / diagnostics, other performance and identifiers as applicable | Reliability/fraud/security. Confirm hosting logs, IP handling, retention, access and any downstream telemetry. No claim of native crash monitoring is justified by server counters. |
| Notification registration tokens and delivery metadata | Device ID / device or other IDs | Token lifecycle exists; actual enabled browser/native delivery processors must be verified. No native push SDK is currently present. Delete/revoke tokens on account/device removal. |

Purposes above are a **mapping worksheet**, not checked store-form answers.
For each type record collected/shared, required/optional, ephemeral/persisted,
purpose, linked identity, tracking, recipients, retention, deletion and exact
evidence. Apple's and Google's definitions differ: do not copy one form into
the other. Data-protection consent and an ATT tracking determination are also
different questions.

## SDKs and processors found or requiring confirmation

| Component | Evidence | Disclosure/release consequence |
|---|---|---|
| Clerk | `@clerk/react`, `@clerk/themes` frontend; `@clerk/express` backend; managed tenant confirmed | Authentication, session/device/security processing. Confirm production provider list, residency, subprocessor terms, telemetry and erasure. Do not put account secrets or raw tokens in the worksheet. |
| Replit hosting/database/App Storage | Express/Vite artifact services, PostgreSQL, storage integration | Confirm actual region, backup/log expiry, access, subprocessors and production configuration. Deployment inspection currently says not deployed. |
| Google Cloud Storage client | Server `@google-cloud/storage`, through existing storage implementation | This is server storage, NOT evidence that Firebase Analytics or a Google mobile SDK is installed. Contractual recipient/processor classification and storage region remain to be verified. |
| Google Fonts | Remote `fonts.googleapis.com` import in `artifacts/me-social/src/index.css` | Third-party font requests expose network metadata to Google. Resolve by licensed local hosting or disclose and review provider basis before release. Do not claim there are no third-party requests. |
| External article/music/video/organisation providers | Link/consented-embed features | Plain external links differ from embedded tracking resources. No tracking embed before deliberate consent. Retain plain-link alternative; review any actual runtime request. |
| Native crash/push/analytics SDKs | None in the current web-only project | Not “not collected forever”: block final disclosures until the actual native dependency and network audit. Do not silently add a new processor. |
| Translation | No established private-content provider/privacy basis | Do not send private content for translation. Future provider use requires a fresh disclosure/consent review; machine outputs labelled and originals retained. |

No advertising SDK or billing integration was identified in the current app
manifests. That is **not** a guarantee about an unbuilt native binary or SDK
telemetry. Do not monetise private health data; disclose any future sponsorship.

### Observed social sign-in / Apple assessment

The actual development desktop sign-in page on 19 October 2026 shows **Continue
with Google**, alongside email entry, and no equivalent Apple option. This is
observed UI, not a completed OAuth transaction or proof of production-provider
settings. With that Google option used for the primary account, plan for
guideline 4.8 compliance before an iOS submission; the first-party-only exception
cannot be assumed. Sign in with Apple is a practical eligible option, but needs
owner Apple identifiers/capabilities and real managed-provider configuration.
Test private relay email, account linking/recovery without accidental merges,
revocation and deletion. Do not add an inert Apple button or weaken MFA. No
provider settings were changed in Phase 18.

## Minimal permissions / purpose copy

These are candidate explanations for a native implementation, **not installed
Info.plist/Android permissions**:

| Feature | Plain explanation | Least privilege |
|---|---|---|
| Record voice | “Use your microphone to record a voice story when you choose Record. You can stop or cancel the recording.” | Request only on explicit recording. Denial must preserve text posting. Current web recorder uses `getUserMedia({audio:true})`. |
| Select media | “Choose the photos or videos you want to share. Me only receives the items you select.” | Prefer system-selected-item pickers. No full-library/Android broad media-read permission without proven necessity and policy review. Upload hold still applies. |
| Camera, if later implemented | “Use your camera to take a photo or video when you choose to capture one.” | Do not declare/request a camera permission solely because upload accepts video. Audit actual capture implementation first. |
| Optional notifications, if a real delivery adapter is enabled | “Allow notifications for the updates you choose. You can change this in Settings.” | No notification requirement for account access, no private text on lock screens, respect quiet hours and device revocation. |

No permission planned for contacts, precise location, HealthKit/Health Connect,
background microphone/camera, advertising identifiers or broad storage access.
If native implementation adds one, reopen this review. Test denial, limited
photo access, revoked permission, quiet hours and device/account switching.

## Deletion release check

Settings already exposes export and a freshly reverified deletion **request**.
Do not describe a pending request as completed erasure. Verify all registered
modules, private originals/derivatives, caches, tokens and identity/other
processors; document justified evidence holds and actual backup expiry.
Google also needs a published, functional account-deletion web request flow
usable after uninstall. Never weaken authentication or build an unverified
email-based delete endpoint. If Apple login is introduced, include Apple token
revocation in the processor lifecycle.
