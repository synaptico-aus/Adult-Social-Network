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

Phase 0 establishes the responsive product foundation and documents privacy, accessibility, permissions, and the cross-platform architecture. Social features remain planned until later phases.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Implement one numbered phase at a time and preserve verified work.
- Never imply incomplete features or integrations are production-ready.
- Apply audience rules to search, feeds, media, notifications, exports, and shared links.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
