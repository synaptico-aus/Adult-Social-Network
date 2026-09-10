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