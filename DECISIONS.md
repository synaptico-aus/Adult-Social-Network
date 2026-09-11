# Me — Architecture and Product Decisions

## D-001: Separate web and native presentation layers

**Decision:** Use React/Vite for responsive web and Expo/React Native for future iOS and Android clients.

**Reason:** This preserves mature web semantics and native mobile accessibility while avoiding the constraints of forcing one UI layer across every platform.

**Consequence:** Visual components are not assumed to be portable. API contracts, domain concepts, validation rules, and suitable non-UI utilities should be shared.

## D-002: One shared server contract

**Decision:** All clients use the shared Node.js API defined through OpenAPI and generated TypeScript clients.

**Reason:** Privacy and authorization must be enforced consistently by the server, not reimplemented independently by each client.

**Consequence:** New backend-backed features begin with the API contract. Client-only permission checks are never treated as security controls.

## D-003: Restricted visibility by default

**Decision:** Profiles and personal posts default to restricted visibility. Public visibility always requires explicit opt-in.

**Reason:** People affected by dementia may face heightened privacy and safeguarding risks. Ambiguous or inherited public defaults are unacceptable.

**Consequence:** Every feature involving discovery or distribution must evaluate audience rules, blocks, and revocation on the server.

## D-004: Relationships do not transfer account rights

**Decision:** Family or support relationships do not grant access to another person’s account.

**Reason:** People living with dementia retain their own account rights.

**Consequence:** Any future delegation or supported-access feature requires explicit consent, narrow capabilities, revocation, and auditability. It cannot be inferred from a family label.

## D-005: Identity labels are non-authoritative

**Decision:** Self-selected roles are profile descriptions only.

**Reason:** A user claiming a role must never receive staff permissions, moderation powers, medical authority, or a verified badge.

**Consequence:** Staff and verification status require separate, server-controlled records and processes.

## D-006: Private media storage

**Decision:** Store media bytes in private object storage and keep only object paths and queryable metadata in PostgreSQL.

**Reason:** Media access must follow the same audience and revocation rules as the content that references it.

**Consequence:** No public bucket URLs, base64 database payloads, or permanently shareable links. Access will use short-lived authorization-aware delivery.

## D-007: No production claims for incomplete integrations

**Decision:** Incomplete external services remain disabled behind explicit feature flags and are named as dependencies.

**Reason:** Development mocks are not production implementations, especially for authentication, moderation, messaging, storage, and notifications.

**Consequence:** UI and documentation must use truthful “planned,” “preview,” or “unavailable” wording until integrations and checks are complete.

## D-008: Accessibility is phase-local

**Decision:** Accessibility criteria and checks are included in every relevant phase rather than postponed to launch.

**Reason:** Retrofitting accessibility after complex social flows are built creates avoidable barriers and rework.

**Consequence:** Each phase records keyboard, screen-reader semantics, contrast, text scaling, touch targets, reduced motion, errors, and cognitive load where applicable.

## D-009: Simple View changes presentation only

**Decision:** Simple View is an optional device-persisted presentation preference that enlarges controls and reduces visible choices while preserving essential functions.

**Reason:** A simplified interface can reduce cognitive load, but it must never remove account rights or silently alter privacy and permissions.

**Consequence:** Permission checks never read Simple View state. Essential navigation, a clear Home action, familiar contacts, and Understanding Dementia access remain available.

## D-010: Planned destinations remain honest

**Decision:** Navigation may expose the planned product structure, but incomplete destinations and Create actions must identify themselves as unavailable or planned.

**Reason:** A clickable control that implies publishing, messaging, or discovery works would misrepresent the current implementation.

**Consequence:** Phase 1 routes can orient users and preview states, but cannot fabricate member data or complete trust-critical actions.

## D-011: Account eligibility is server-owned and data-minimal

**Decision:** A local member is provisioned only after Clerk confirms an
authenticated, verified email session and the server confirms current-version
acceptance of Terms, Privacy, and Community Guidelines plus 18+ eligibility.

**Reason:** Client checks and profile labels are not authorization controls.
Birth dates are unnecessary for the decision and create avoidable privacy risk.

**Consequence:** Store only eligibility result, method, policy version, and
timestamp. A family relationship never grants account access. Suspected
underage cases require a documented, staffed review process before launch.

## D-012: Clerk owns recovery and session identity

**Decision:** Clerk issues/redeems recovery tokens and manages browser sessions;
the application uses cookie-based web auth and never stores raw tokens.

**Reason:** Reimplementing recovery would create a second security boundary and
could accidentally let recovery confer access to a relative's account.

**Consequence:** The product exposes honest entry points to Clerk MFA/recovery,
server-gates staff actions, and only stores local deletion-request state.

## D-013: Phase 3 profile privacy and authority boundaries

Profile fields are private by default with explicit audience values, discoverability is opt-in, and view-as previews use the ordinary signed-in member policy. Descriptive roles never confer authority; verification is separate, pending until staff review, and exports are scoped to the authenticated account. Consent changes are append-only.

**Reason:** Profile information can disclose health context, location, relationships, or professional claims. A visible label or client-side setting is not an authorization boundary.

**Consequence:** All filtering, ownership, discoverability, export scope, and verification decisions are enforced by the API. Assisted access remains unavailable until a separate revocable, reviewed delegation design exists.

## D-014: Profile media remains private and account-owned

Phase 3 permits one private profile photo but keeps This is Me cards text-only until Phase 7. Profile photos use owner-scoped private object paths and authenticated delivery rather than public URLs.

**Reason:** Card media needs the broader authorization, accessibility, moderation, and deletion model planned for Phase 7.

**Consequence:** The server rejects photo, audio, media, and attachment fields on This is Me cards. Profile photo upload and serving validate account ownership, file type, and size.

## D-015: Audience and safety decisions are server-owned

**Decision:** Content modules use one shared audience policy with restricted
defaults; public is explicit. Blocks, mutes, restrictions, reports, moderation,
appeals, and staff capability checks are enforced by the API rather than clients.

**Consequence:** Future groups, circles, feeds, and content must pass the same
policy and account-scope checks. Anonymous web access is denied unless the
content itself explicitly chose public.

## D-016: Screening and retention stay truthful

**Decision:** The initial text screener is deterministic and local, while media
screening is an interface that holds uploads when required screening is
unavailable. No vendor integration is represented as present.

**Consequence:** Audit records remain minimal and append-only, and retention
duration/pseudonymisation awaits documented privacy/legal approval.

## D-017: Staff authority requires an active assignment

**Decision:** Staff capability routes require an active database role assignment,
role-specific server defaults, and fresh second-factor verification. An explicit
non-empty assignment capability list replaces the role defaults (allowing
deliberate narrowing); there is no wildcard or profile/private-metadata fallback.

**Consequence:** Administrator, moderator, and education_editor remain distinct,
and role changes are auditable database operations rather than claims in a
profile or legacy Clerk metadata.

## D-018: Sanctions use a controlled vocabulary

**Decision:** Staff moderation sanctions are limited to warning, content removal,
temporary restriction, suspension, and permanent removal. Every sanction requires
a reason and remains subject to appeal.

**Consequence:** Staff actions and audits use consistent labels; arbitrary
free-text sanction types are rejected at the API boundary.
## Phase 5 decisions
- Friendship pairs use canonical member ordering and database uniqueness; follow relationships remain directional.
- Pair-scoped transactions serialize request, friendship, follow, and block
  changes so blocking cannot race with a new access-granting relationship.
- Following never upgrades audience access. Friends-audience reads must resolve
  current friendship and either-direction blocks from the server at read time.
- Suggestions are explicit opt-in and use only voluntarily stored,
  member-visible interests, language, and broad region. They never use or expose
  dementia connection, roles, or inferred traits.
- Discoverability does not override field visibility: search and suggestions
  require a member-visible preferred name.
- Content audience authorization has no publishing route in Phase 5; future content reads must call `canViewMemberContent`, which resolves live friendship/block state before applying audience policy.

### Phase 6 decisions

Retained evidence is immutable and policy-versioned; ordinary content is tombstoned on
member deletion. Shares retain only a source ID and are reauthorized against the source
on every read. Interaction authorization uses canonical pair advisory locking before
post-row locking.

- Currently enforceable post audiences are `only_me`, `friends`, and `public`.
  Group and education filters remain unavailable until those modules have real
  membership and content authorization.
- Automated screening writes an explicit `allowed` or `held` result. A pending
  member report does not hide allowed content; authorized staff decisions can.
- Any published body change is re-screened in the same transaction as the edit,
  so an old approval can never authorize new text.
- Feed, saved, direct-link, internal-share, notification, and interaction access
  always resolve current friendship, blocks, moderation, and source visibility.
- Chronological pagination uses `(created_at, id)` keysets and continues scanning
  across filtered rows; it does not rank by distress, conflict, or engagement.
