---
name: Education publication evidence
description: Durable publication, evidence freshness, rights, and correction rules for education content.
---

Publish only the current immutable lesson revision after approval by a
different, actively assigned qualified reviewer. Publication and revision
creation must share a lesson lock and re-read state inside the transaction.

**Why:** Validating before acquiring a shared lock allowed a new draft revision
to supersede the approved revision while publication was in flight.

**How to apply:** Draft, review, approve/reject, publish, review-due, archive,
withdrawal, and correction transitions all lock the lesson and preserve prior
revisions and source records.

Treat evidence freshness as an operational publication policy, not proof that a
claim is medically true. Current-evidence source dates must be nonfuture and
within five years; verification and evidence-check dates must be nonfuture and
within 365 days, based on database time. Historical population research also
needs a valid current-evidence source on the same revision.

**Why:** A source labelled “current” without bounded dates is not a meaningful
publication gate, and historical population findings cannot support individual
prevention guarantees.

**How to apply:** Keep region, provenance, rights/permissions, educational
purpose, no-blame/no-guarantee review attestations, and restricted-content
link-only confirmation with each revision. Corrections and withdrawals append
records; they never rewrite old evidence.