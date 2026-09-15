# Phase 11 evidence

## Education safety boundary

- `PDF PD MOOC - Norton paper summary.pdf` is missing from the supplied
  workspace.
- The education taxonomy is seeded only with categories. There are **zero
  seeded lessons**, and no paper-derived lesson or claim has been published.
- Production readiness is not claimed by this implementation. Review,
  deployment, schema push, focused tests, and operational verification remain
  release checks.
- Education content uses immutable revisions, traceable source metadata,
  rights/permission fields, correction and withdrawal records, explicit
  author/reviewer separation, fresh MFA and active staff capabilities.
- Public reads select only approved published revisions. Review-due content is
  clearly flagged; archived and withdrawn content, including old direct links,
  is not served.
- Private saves and progress are owner-bound, exportable, and removed by the
  account-deletion hook. Completion is opt-in and carries non-clinical
  qualification wording.
- Focused `phase11.test.ts` passed all six real-route scenarios covering
  lifecycle visibility, capability/MFA and publish gates, public reads,
  private isolation/export/deletion, opt-in retraction, withdrawal, version
  history, and licensed-link handling.
- Schema push, API/libs typechecks, code generation, and diff checks passed.
- Four frontend lifecycle/date/cache contract checks passed. The final
  architecture review found no blocker, high, or medium issue.
- The full API regression run passed 98/99; the only failure was the documented
  Phase 6 pagination-ordering flake, which passed 12/12 in immediate isolation.
- Publish and lifecycle mutations lock and re-read the lesson in transactions;
  evidence freshness, rights status, plain-text body limits, and historical
  current-evidence pairing are enforced at the publish gate. Generated
  Phase 11 contracts use explicit entity schemas.
- Publication freshness is an operational policy, not a statement of medical
  truth: each current-evidence source must have a source date no more than five
  years old and not in the future, with verification and evidence checks no
  more than 365 days old and not in the future according to database time.
  `containsCopiedRestrictedContent` is an explicit author declaration; it is
  not automated plagiarism detection.