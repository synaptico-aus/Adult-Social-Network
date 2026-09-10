# Me — Build Plan

Status values: **Not started**, **In progress**, **Blocked**, **Verified**.

## Phase 0 — Product and technical foundation

**Status: Verified**

### Scope

- Create the responsive web application foundation.
- Choose and document a compatible web/mobile architecture.
- Establish brand, accessibility, privacy, audience, and permission principles.
- Record acceptance criteria, checks, results, and unresolved dependencies.
- Do not implement or imply production authentication, member data, posting, messaging, moderation operations, media storage, exports, or notifications.

### Architecture

- Web: React, Vite, and TypeScript in `artifacts/me-social`.
- Future mobile: Expo and React Native with TypeScript as a separate client only when the mobile phase begins.
- Shared contracts: OpenAPI in `lib/api-spec/openapi.yaml`, generated clients and Zod schemas.
- Shared backend: Node.js/Express in `artifacts/api-server`.
- Data: PostgreSQL through the shared database library.
- Media: private object storage; PostgreSQL stores object paths and queryable metadata only.
- Authentication: server-enforced managed authentication. Provider selection is deferred until the authentication phase.
- Shared code should live in workspace libraries where it is genuinely platform-compatible. UI should remain platform-specific where accessibility or interaction patterns differ.

### Why this avoids unnecessary duplication

The responsive web client remains a dedicated React application rather than forcing React Native Web into the existing web artifact. Mobile will use Expo/React Native. Both clients will share API contracts, validation concepts, domain types, and suitable non-UI logic through workspace libraries. This preserves native accessibility and interaction patterns without duplicating the API and domain model.

### Permission baseline

- Account holder: retains control of their own account and content.
- Family or connected person: receives no account access merely because a relationship exists.
- Self-selected identity role: descriptive only; grants no staff permission or verification.
- Moderator: can act only through explicit server-side moderation permissions and auditable workflows.
- Administrator: narrowly scoped operational permissions; not inferred from profile data.
- Public audience: only content whose owner explicitly opted into public visibility.
- Connections audience: only explicitly accepted connections, subject to blocks and later relationship rules.
- Private audience: account holder only unless a later, explicit sharing feature defines otherwise.
- Default profile and personal-post audience: restricted, never public.

### Planned checks

- TypeScript typecheck for the web artifact.
- Visual preview at desktop and mobile viewport sizes.
- Browser console review.
- Manual review of labels, contrast, focus visibility, touch-target sizing, reduced-motion behavior, and truthful phase wording.

### Results

- Web TypeScript typecheck passed on 10 September 2026.
- Desktop preview at 1440 × 1200 rendered correctly on 10 September 2026.
- Mobile preview at 390 × 844 rendered correctly on 10 September 2026.
- Current preview browser logs contained no runtime errors after the final fix.
- Static accessibility review confirmed semantic landmarks, labelled controls, hidden decorative icons, and a 48 × 48 mobile menu target.
- Full assistive-technology and hands-on keyboard testing remains a required repeatable check in later interactive phases.

### Migrations

None in Phase 0. No application tables are introduced.

### Unresolved external dependencies

- Authentication provider configuration.
- Private object storage configuration.
- Transactional email and push notification providers.
- Moderation operations, escalation policy, and staffing.
- Legal/privacy review for launch regions.
- App Store and Play Store accounts and submission requirements.

## Phase 1 — Authentication, consent, and private profiles

**Status: Not started**

Server-enforced account creation, session handling, consent, profile visibility, account rights, and authorization tests.

## Phase 2 — Connections, private posting, and feeds

**Status: Not started**

Restricted-by-default posts, precise audiences, connections, blocks, privacy-aware feeds, and reporting entry points.

## Phase 3 — Media and private storage

**Status: Not started**

Private uploads, signed access, metadata, deletion, accessibility descriptions, and privacy-aware media delivery.

## Phase 4 — Messaging and notifications

**Status: Not started**

Private messaging, notification preferences, abuse controls, and privacy-safe delivery.

## Phase 5 — Moderation, reporting, and safety operations

**Status: Not started**

Moderation queues, staff permissions, audit records, appeals, escalation, and measurable safety checks.

## Phase 6 — Exports, shared links, and account lifecycle

**Status: Not started**

Privacy-aware exports, revocable shared links, deletion, retention, and account recovery.

## Phase 7 — Mobile applications

**Status: Not started**

Expo/React Native clients for iOS and Android, tablet layouts, device accessibility checks, and store-readiness work.

## Phase 8 — Launch readiness

**Status: Not started**

Security, accessibility, privacy, moderation, performance, operational, legal, and store-release verification. No public launch occurs before this phase is verified.