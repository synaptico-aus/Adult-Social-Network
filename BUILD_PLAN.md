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

## Phase 1 — Crimson design, navigation, and Simple View

**Status: Verified**

### Scope

- Establish reusable buttons, cards, forms, dialogs, media controls, and loading, empty, and error states.
- Add responsive mobile tabs and desktop navigation for Home, Explore, Groups, Messages, and Me.
- Provide labelled Create and Understanding Dementia access without presenting future features as complete.
- Add an optional, locally persisted Simple View with larger controls, fewer choices, familiar contacts, and a clear Home action.
- Add light and dark themes without using colour as the only source of meaning.
- Preserve all Phase 0 privacy and permission decisions.

### Permission rules

- Simple View is a presentation preference only.
- Theme and Simple View preferences do not grant access, alter audiences, or change account rights.
- Future destinations remain clearly identified as planned until their server-enforced features exist.

### Planned checks

- Web TypeScript typecheck.
- Desktop, narrow-phone, and landscape visual previews.
- Browser console review.
- Source review for landmarks, labels, focus visibility, touch targets, safe-area handling, reduced motion, text scaling, and non-autoplay media.
- Persistence review for Simple View and theme preferences.

### Migrations

None. Phase 1 presentation preferences are stored on the current device; no account permission or server data is changed.

### External dependencies

None for this presentation phase. Managed authentication exists separately but is not modified by this phase.

### Results

- Web TypeScript typecheck passed on 11 September 2026.
- Desktop preview at 1440 × 1000, narrow-phone preview at 320 × 700, and landscape preview at 844 × 390 rendered successfully.
- A browser journey at 320 × 700 confirmed all five tab labels remain visible, no fabricated people or posts appear, and planned Create behavior is truthful.
- Simple View persisted across navigation and reload; familiar contacts remained an honest empty state.
- Dark theme persisted across reload.
- Home and Understanding Dementia remained accessible in Simple View.
- Browser testing reported no console or page errors.
- Source review confirmed labelled controls, semantic landmarks, safe-area insets, visible focus styles, reduced-motion handling, non-autoplay media controls, and flexible text/zoom layouts.

## Phase 2 — Accounts, authentication, and account lifecycle

**Status: Blocked**

Managed Clerk authentication, server-side local member provisioning, verified-email
and 18+ eligibility gates, versioned Terms/Privacy/Community Guidelines
acceptance, session controls, accessible MFA/recovery entry points, and
reauthenticated deletion requests. Clerk remains the issuer and redeemer of
recovery tokens; this product never stores raw tokens or grants a relative
access to another account.

Age assurance vendor integration, suspected-underage review/escalation, and
Clerk dashboard MFA/email/rate-limit configuration are launch dependencies.
Until those are approved, eligibility uses
minimal self-declared evidence and stores only the result, method, policy
version, and timestamp—not a birth date. Deletion may remain explicitly
pending/manual until a worker is deployed; registered deletion hooks are the
contract later modules must implement.

Native Expo secure token storage using `expo-secure-store` is a future mobile
design dependency, not currently implemented.

### Results

- Replit-managed Clerk proxy and branded web sign-in/sign-up are wired for development and production routing.
- Verified-email onboarding stores only an adult-eligibility result, method, policy version, timestamp, and versioned legal acceptances; no birth date or diagnosis is collected.
- Account summary, session listing/revocation, logout, MFA/recovery entry points, deletion initiation/cancellation/status, and the deletion-hook contract are implemented.
- Staff tools require a server-controlled Clerk private-metadata role and a fresh second factor.
- Full workspace typecheck and eight account security-policy tests passed on 11 September 2026.
- A browser journey completed verified-email onboarding and opened the account-security page; public desktop and mobile sign-in previews rendered.
- Phase 2 remains Blocked for release on the external dependencies listed above. Social capabilities remain planned.

## Phase 3 — Profiles, This is Me, consent, and verification

**Status: Verified in development**

Profiles, restricted field visibility, explicit discoverability, ordinary-member view-as previews, text-only This is Me cards, privacy controls, append-only consent history, account-owned exports, and staff-reviewed verification requests are server foundations. Profile photos use private object paths; public object URLs and delegated access are not supported. Photo/audio/media cards wait until Phase 7.

### Results

- Members can edit preferred name, private profile photo, biography, optional language, broad region, interests, optional dementia connection, and multiple descriptive roles.
- Every profile field has a server-enforced audience. Sensitive fields start private, discoverability starts off, and the ordinary-member preview uses the same filtering policy.
- Four text-only This is Me card types support create, edit, persistence, and deletion. Photo and audio cards remain unavailable until Phase 7.
- Professional and organisation verification requests remain pending until a staff member with a server-controlled role and fresh MFA reviews them. Self-selected roles never grant a badge or authority.
- Private photo uploads use authenticated, owner-scoped App Storage paths with type and size limits. Public object URLs are not used.
- Privacy changes create append-only consent records. Profile exports contain only the signed-in member's profile, cards, consents, and verification history.
- Profile data and private photos are registered with account deletion hooks; retained audit evidence is minimised and the future worker must pseudonymise retained member links.
- Development schema push, full workspace typecheck, 18 policy tests, and an authenticated desktop/mobile browser journey passed on 11 September 2026.
- Production release remains blocked by Phase 2 launch dependencies, production App Storage verification, staffed verification operations, and approved retention/pseudonymisation procedures.

## Phase 4 — Connections, private posting, and feeds

**Status: Not started**

Restricted-by-default posts, precise audiences, connections, blocks, privacy-aware feeds, and reporting entry points.

## Phase 5 — Media and private storage

**Status: Not started**

Private uploads, signed access, metadata, deletion, accessibility descriptions, and privacy-aware media delivery.

## Phase 6 — Messaging and notifications

**Status: Not started**

Private messaging, notification preferences, abuse controls, and privacy-safe delivery.

## Phase 7 — Moderation, reporting, and safety operations

**Status: Not started**

Moderation queues, staff permissions, audit records, appeals, escalation, and measurable safety checks.

## Phase 8 — Exports and shared links

**Status: Not started**

Privacy-aware exports, revocable shared links, deletion, retention, and account recovery.

## Phase 9 — Mobile applications

**Status: Not started**

Expo/React Native clients for iOS and Android, tablet layouts, device accessibility checks, and store-readiness work.

## Phase 10 — Launch readiness

**Status: Not started**

Security, accessibility, privacy, moderation, performance, operational, legal, and store-release verification. No public launch occurs before this phase is verified.