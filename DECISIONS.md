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