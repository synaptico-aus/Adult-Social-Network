# Me — Acceptance Criteria

## Phase 0

### Product foundation

- [x] The web app clearly identifies Me as an adult social product for people affected by dementia.
- [x] The interface is explicitly labelled as a development preview.
- [x] No screen fabricates members, posts, messages, reviews, medical expertise, or completed checks.
- [x] Unimplemented capabilities are described as planned, not working.

### Brand and responsive UI

- [x] The interface uses the approved crimson, dark crimson, pale crimson, warm white, and charcoal palette.
- [x] Text and interactive controls have readable contrast.
- [x] The layout works at phone and desktop widths and uses responsive tablet breakpoints.
- [x] Icons used as controls have visible text labels or accessible names.
- [x] Controls have focus styling and practical touch targets.
- [x] Motion is limited to non-essential transitions and does not block use.

### Privacy and permissions

- [x] The app states that profiles and personal posts are restricted by default.
- [x] “Public” is described as explicit opt-in visibility.
- [x] Family relationships are not represented as granting account access.
- [x] A person living with dementia is not represented as losing their own account rights.
- [x] Self-selected roles are not represented as granting staff access or verification.
- [x] Planned search, feed, media, notification, export, and shared-link behavior is documented as privacy-aware.

### Architecture and records

- [x] Web architecture is chosen and documented.
- [x] Mobile architecture is documented without creating an unnecessary duplicate client in Phase 0.
- [x] Shared API, database, validation, and media-storage direction is documented.
- [x] Phase status, migrations, permissions, checks, and unresolved dependencies are recorded.
- [x] No database migration is required for Phase 0.

### Verification record

Fill this section only with checks actually performed.

| Check | Platform or viewport | Result |
| --- | --- | --- |
| TypeScript typecheck | Web | Passed, 10 September 2026 |
| Visual preview | 1440 × 1200 desktop | Passed, 10 September 2026 |
| Visual preview | 390 × 844 mobile | Passed, 10 September 2026 |
| Browser console | Web | No current runtime errors, 10 September 2026 |
| Labels, landmarks, focus styles, and touch-target source review | Web | Passed, 10 September 2026 |
| Hands-on keyboard and assistive-technology review | Web | Deferred until interactive flows exist |

## Phase 0 completion rule

Phase 0 is **Verified** only when every applicable criterion above passes and the verification record contains actual results. Otherwise it remains **In progress** or **Blocked**.

## Phase 1

### Reusable interface

- [x] Buttons, cards, forms, dialogs, media controls, and loading, empty, and error states use the crimson design language.
- [x] Reusable controls have visible labels or accessible names and practical touch targets.
- [x] Media does not autoplay.
- [x] State is never communicated by colour alone.

### Navigation and responsive layout

- [x] Mobile primary navigation includes Home, Explore, Groups, Messages, and Me.
- [x] Create is labelled and Understanding Dementia is easy to find.
- [x] Desktop uses a sidebar, readable central column, and optional secondary content only when space permits.
- [x] Layout remains usable at narrow phone widths, in landscape, and under desktop zoom.
- [x] Safe-area insets and on-screen keyboard constraints are accounted for.
- [x] Future features are presented as planned or unavailable rather than working controls.

### Simple View and themes

- [x] Simple View provides larger controls, fewer choices, an honest familiar-contacts empty state, and a clear Home action.
- [x] All essential navigation and Understanding Dementia access remain available in Simple View.
- [x] Simple View persists on the current device.
- [x] Enabling Simple View does not change permissions or content audiences.
- [x] Light and dark themes are available and persist on the current device.

### Accessibility

- [x] Semantic landmarks and screen-reader labels are present.
- [x] Keyboard focus is visible and dialogs/forms use keyboard-accessible primitives.
- [x] Reduced-motion preferences are respected.
- [x] Text can scale without clipping essential controls.
- [x] Gestures are not the only way to perform an action.

### Verification record

| Check | Platform or viewport | Result |
| --- | --- | --- |
| TypeScript typecheck | Web | Passed, 11 September 2026 |
| Visual preview | 1440 × 1000 desktop | Passed, 11 September 2026 |
| Visual preview and interactive journey | 320 × 700 narrow phone | Passed, 11 September 2026 |
| Visual preview | 844 × 390 landscape | Passed, 11 September 2026 |
| Browser console | Web | No errors during tested journey, 11 September 2026 |
| Simple View persistence | Mobile web navigation and reload | Passed, 11 September 2026 |
| Dark-theme persistence | Mobile web reload | Passed, 11 September 2026 |
| Accessibility and preference source review | Web | Passed, 11 September 2026 |

## Phase 2 — Accounts and lifecycle

- [x] Clerk managed-tenant proxy/client wiring, branded sign-in/sign-up, and
  full Wouter callback paths are configured.
- [x] Server rejects unauthenticated, unverified-email, incomplete-consent, and
  under-18 requests; no birth date is persisted.
- [x] Account summary, session list/revocation, logout, and MFA/recovery entry
  points are accessible and server-authorized.
- [x] Staff operations require a server-controlled role and verified Clerk MFA;
  profile labels never grant staff access.
- [x] Deletion initiation requires fresh reauthentication evidence, supports
  cancellation/status, and remains honestly pending until all registered hooks
  and an approved worker/process complete.
- [x] Sensitive routes are rate limited without retaining secrets or raw tokens.
- [x] Automated tests cover unauthorized access, underage rejection, session
  revocation authorization, deletion reauthentication, and expired/reused
  recovery-token policy logic. Clerk remains the production recovery-token
  issuer/redeemer.

Phase 2 remains **Blocked** until Clerk dashboard MFA/email/rate-limit settings,
age-assurance vendor integration, and a staffed suspected-underage review
process are confirmed for the launch environment.

### Phase 2 verification record

| Check | Result |
| --- | --- |
| Full workspace typecheck | Passed via `pnpm run typecheck` |
| Account policy/security tests | Passed: 8 tests via `pnpm --filter @workspace/api-server test` |
| API health check | Passed: `GET /api/healthz` returned 200 |
| Unauthorised account and staff access | Passed: both endpoints returned 401 without a Clerk session |
| Browser account journey | Passed after one hook-order fix: verified-email sign-in, 18+ onboarding, current document acceptance, account page, sessions, MFA/recovery, deletion status, and logout rendered |
| Responsive preview | Public desktop at 1440 × 1000 and branded sign-in at 390 × 844 rendered |
| API route integration tests | Not claimed; the current automated suite is policy-level and does not replace Clerk/database integration coverage |

### Phase 2 launch dependencies

Age-assurance vendor integration and a staffed suspected-underage review process
must be approved before launch. Expo secure token storage with
`expo-secure-store` is documented future work, not an implemented mobile flow.

## Phase 3 — Profiles, This is Me, privacy, and verification

- [x] Profile and card APIs are authenticated and account-owned; delegated or relative identity input is rejected.
- [x] Profile fields and sensitive dementia connection default to private, discoverability requires explicit opt-in, and view-as never reveals private fields.
- [x] Roles are descriptive only and cannot grant authority or a verification badge.
- [x] This is Me cards accept exactly four text-only kinds; media payloads are rejected pending Phase 7.
- [x] Verification requests remain separate, allow one pending request, and cannot be self-approved.
- [x] Consent history is append-only with explicit revocation records; exports are authenticated and account-scoped JSON.

### Phase 3 verification results

| Check | Result |
| --- | --- |
| Development schema push | Passed, including unique member/card-kind and card-order constraints |
| Full workspace typecheck | Passed |
| Account and profile policy tests | Passed: 18 tests |
| Authenticated browser journey | Passed: profile save, private photo upload/render, privacy defaults, discoverability, view-as filtering, card create/edit/delete, verification request, consent history, and own JSON export |
| Responsive preview | Passed at 1280 × 720 and 390 × 844; the planned Create Post control was removed from profile/account screens to avoid covering settings |
| Formal Clerk/database route integration suite | Not claimed; current evidence combines policy tests with one real development browser journey |

Phase 3 is verified in development. Production release still depends on Phase 2 launch requirements, production App Storage verification, staffed verification operations, and an approved retention/pseudonymisation process. No public object URL or delegated access is supported.

## Phase 4 — Privacy, safety, and staff foundation

- [x] A shared server audience policy defines only_me, friends, this_group,
  my_circle, selected_communities, and explicit public.
- [x] Anonymous requests cannot access non-public audiences; public access is
  possible only when content explicitly selects public.
- [x] Authenticated member safety relationships, reports/history, and appeals
  are account-scoped.
- [x] A real published support contact is configured through
  SUPPORT_CONTACT_EMAIL and returned by the authenticated support endpoint.
- [x] Staff queue, urgent queue, evidence access, moderation decisions, and
  appeal review routes require fresh Clerk MFA and server capability checks;
  profile roles do not grant access.
- [x] Database schemas cover relationships, reports, moderation states,
  appeals, staff assignments, minimal append-only audits, and screening results.
- [x] Screening interfaces are deterministic/local only; unavailable required
  media screening holds content rather than silently allowing it.
- [ ] Member publishing, complete group/circle evaluation, production screening,
  and retention approval remain pending.

### Phase 4 verification record

| Check | Result |
| --- | --- |
| OpenAPI code generation | Passed |
| Shared database library typecheck | Passed |
| API-server typecheck | Passed |
| Full API suite | Passed: 33 policy, screening, sanction, and direct HTTP route tests |
| Development schema push | Passed after Phase 4 safety retention changes |
| Direct HTTP route authorization tests | Passed: 7 direct HTTP scenarios via `pnpm --filter @workspace/api-server test` |