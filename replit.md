# Me

A privacy-first adult social product for people affected by dementia globally.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Responsive web app: `artifacts/me-social`
- Shared API server: `artifacts/api-server`
- API contract: `lib/api-spec/openapi.yaml`
- Database schema: `lib/db/src/schema`
- Phase records: `BUILD_PLAN.md`, `ACCEPTANCE.md`, `DECISIONS.md`

## Architecture decisions

- React/Vite web and future Expo/React Native mobile use separate presentation layers.
- Clients share a server-enforced OpenAPI contract and suitable domain libraries.
- Profiles and personal content default to restricted visibility; public is explicit opt-in.
- Relationships and self-selected identity labels never grant account or staff permissions.
- Media bytes belong in private object storage, not PostgreSQL.

## Product

Phase 2 adds server-enforced accounts and lifecycle controls. Phase 3 adds
server-enforced profiles, This is Me cards, privacy, consent history, exports,
and separate verification requests. Clerk owns
authentication, browser cookies, sessions, MFA, and recovery issuance. The local
server provisions members only after verified email, current consent versions,
and an 18+ eligibility decision. Birth dates and raw recovery tokens are never
stored. Social features remain planned until their later phases.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Implement one numbered phase at a time and preserve verified work.
- Never imply incomplete features or integrations are production-ready.
- Age-assurance vendor integration and a staffed suspected-underage review
  process are launch dependencies; self-declared eligibility is not a vendor
  assurance result.
- Future Expo clients will use Clerk's token cache backed by
  `expo-secure-store`; no native client is currently implemented.
- Apply audience rules to search, feeds, media, notifications, exports, and shared links.
- Phase 3 profile fields use private/connections/members audiences with server-side filtering. Discoverability is opt-in and must be changed through the privacy route so consent history remains append-only.
- Self-described roles are never authorization or verification. Staff-reviewed professional or organisation status is stored separately and requires the existing staff MFA gate.
- Phase 3 allows an owner-scoped private profile photo only. This is Me photo/audio cards remain disabled until Phase 7, and assisted account access remains disabled pending a separate revocable, reviewed delegation system.
- Phase 4 backend foundation provides one server audience policy (only_me,
  friends, this_group, my_circle, selected_communities, public), member safety
  relationships, reports, appeals, moderation schemas, and capability-scoped
  staff routes. Anonymous access is denied unless content explicitly selects
  public; member publishing is not implemented.
- Screening is a deterministic interface/default only; no external screening
  provider is configured. Required unavailable media screening holds uploads.
- My Circle is invitation-only and separate from friendships/family labels.
  Circle posts require current membership on every server read. Pre-join history
  is private until an explicit, revocable grant; removal, leaving, closure, and
  blocks revoke future server access but cannot recall downloaded copies.
- Groups keep discoverability, content visibility, and joining policy separate.
  Membership and moderator authority are group-scoped; blocks, leaving, removal,
  and closure revoke future access on every content path.
- Community welcome access requires independent active host training, an exact
  active group assignment, and active membership. Availability copy comes from
  controlled non-SLA templates, and unanswered requests remain visibly pending.
- Group suggestions use only voluntary profile choices. Seeded development
  categories are labelled taxonomy and never create fake members or activity.
- Messaging defaults to mutual friends; broader contact settings create
  recipient-controlled requests. Conversation, attachment, export, notification,
  and deep-link access always reauthorize active membership and blocks.
- Linked group conversations require current active membership in the underlying
  group. Group leave, removal, closure, and blocking serialize against sends and
  revoke future access; rejoining does not reveal intervening history.
- Delete for everyone is distinct from remove only from my view. Staff cannot
  browse messages and can access only exact reported evidence with bounded
  context, a reason, fresh MFA, capability checks, and an audit trail.
- Messages are not end-to-end encrypted. See ENCRYPTION.md for the actual model.
  Push payloads are generic and contain no private message or media content.
- In-app notifications are implemented. APNs/FCM and background Web Push remain
  explicitly incomplete and unverified because no real provider is configured;
  simulated delivery does not count as complete.
- Sensitive audit records are append-only and minimal. Retention duration and
  pseudonymisation remain pending privacy/legal approval.
- Staff access uses only active server role assignments with role-specific
  capability defaults and fresh MFA; legacy profile/private-metadata staff
  wildcards do not authorize capability routes. The runtime support contact
  requires SUPPORT_CONTACT_EMAIL in the deployment environment.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

### Phase 5 relationship and discovery rules
Friends are accepted mutual connections; follows are directional and never
grant extra audience access. Every friends-audience read must resolve current
friendship and either-direction blocks on the server. Search and suggestions
require discoverability and a member-visible preferred name. Suggestions are
opt-in and may use only voluntarily supplied, member-visible interests,
language, and broad region. Pair mutations are transactionally serialized, all
lists are bounded, and no address-book upload or automatic invitation flow is
permitted.

### Phase 6 content rules
Text posts, drafts, chronological feeds, response guidance, comments/replies,
supportive reactions, saves, hides, reports, and internal shares are implemented.
`only_me`, `friends`, `my_circle`, `this_group`, and `public` audiences are valid. Every
feed, direct, saved, shared, notification, report, and interaction path must
reauthorize current audience, friendship, either-direction blocks, moderation,
and original-share visibility. Published body edits must be re-screened in the
same transaction. Internal shares store only a source reference and cannot widen
its audience. Retained evidence is immutable, policy-versioned, capability/MFA
gated, and access-audited. Feed order is reverse chronological only; never rank
for distress, conflict, engagement, or prolonged scrolling.

### Phase 11 education boundary
The education PDF `PDF PD MOOC - Norton paper summary.pdf` is missing. Only
taxonomy categories are seeded: zero lessons and zero paper-derived claims
are published. Education completion is not a clinical qualification, and this
implementation makes no production-ready claim.

### Phase 12 external content boundary
External resources are reviewed links, not a rehosting service. Articles, music,
images and videos must not be downloaded/rehosted without rights. Source review
does not verify every claim. Metadata fetching stays staff-only and SSRF-safe,
and never executes fetched markup. Embeds require both authorised provider use
and separate viewer consent before third-party requests; plain links remain
available. No recommended sources are seeded without independent review.
Private Me external shares remain authenticated deep links, with live original
permissions rather than public snapshots or bearer-token access.

### Phase 16 operating framework

Staff operations live at `/staff/operations`; public service policy/optional
measurement at `/service-experience`, security intake at `/security-report`.
See `docs/phase-16-operations.md`, `docs/phase-16-data-lifecycle.md` and
`docs/phase-16-launch-register.md`. These record procedures and explicit unverified
launch gates, not legal/staffing/backup/provider certification or video approval.
Do not convert operator attestations, sampled page presence, logical bytes or
partial costs into claims of independent approval, 24/7 coverage or live billing.

### Phase 13 video boundary
See `docs/phase13-video.md` for limits, recoverable uploads, processing, coverage,
private playback and deletion. Reels and video posts use the existing audiences
and interaction permissions; playback is never a public object URL.
All newly processed videos are held until independent full-video/audio review
and an allowed malware result. Missing scanners/signatures cannot be waived.
Captions are revision-bound, not automatically generated. Real native-device
testing and production scanner/worker validation remain release gates.

### Development malware scanning
See `docs/malware-screening.md`. The API supervises a private ClamAV daemon and
official signature updates, shared by photo, audio and video completion.
Unavailable/stale/incomplete scans never allow decoding or publication.
Development real-engine verification passed; production operation and real-device
testing have not been approved. Do not change deployment hosting or waive those gates
as part of development scanner maintenance.

### Memory Collections
See `docs/phase14-memory-collections.md` for source authority, deliberate sharing,
in-page reminder consent, rights-aware exports and reference-only deletion.

### Localisation and data use
See `docs/phase15-localisation-data-and-resources.md` for the language release gate,
translation review, optional encrypted drafts, quiet-hour zones and curated directory.
