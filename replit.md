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
