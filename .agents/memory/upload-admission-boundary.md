---
name: Upload admission release boundary
description: Admission and cost containment are separate from screening; upload holds stay in place.
---

Keep all uploads held. Storage admission is distinct from malware screening.
Do not guess unsupported storage-sidecar parameters or remove holds merely
because development admission tests pass.

**Why:** The user explicitly required all uploads to remain held while resolving
the high-impact finding that completion-time size checks do not bound storage
acceptance or charges.

**How to apply:** Future upload or scanner work must preserve this boundary.
Reopening needs independent evidence for the real provider, failure cleanup and
the other existing release prerequisites, not just synthetic storage tests.

Stored-media cleanup authority remains with the evidence-aware asset lifecycle,
even when an owner is inactive or has requested deletion.

**Why:** Account deletion deliberately preserves reported/retained assets.
Treating owner deactivation as orphanhood can erase those preserved sources and
incorrectly release their byte charges.

**How to apply:** An admission-level sweep must defer while the stored media
asset exists, independently of owner state, and tests must include deactivated
owners with retained photo/audio evidence.
