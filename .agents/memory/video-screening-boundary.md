---
name: Video screening boundary
description: Why media approval must bind to a frozen source and complete playback/caption revision.
---
Video review must bind to immutable source bytes, complete processed playback and
the exact caption revision. Do not let an outstanding upload URL replace a
reviewed source; do not approve playback truncated by processing output limits.

**Why:** Completing a signed upload does not revoke its PUT permission. File-size
limits can also terminate a successful encoder before the full duration. Either
case can silently detach approval from what was uploaded or reviewed.

**How to apply:** Preserve the frozen-source boundary when adding processors or
storage providers, verify duration coverage, and invalidate approval when
captions change. Samples/thumbnail checks remain evidence, never full-video
screening; unavailable mandatory checks must remain held.
