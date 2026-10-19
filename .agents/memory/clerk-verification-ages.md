---
name: Clerk verification ages
description: Non-obvious Clerk factor-age and reverification behavior used by sensitive Me account operations.
---

Clerk session `fva` entries are ages in minutes, not timestamps. Sensitive routes should evaluate the appropriate factor age and return Clerk’s structured reverification error when it is too old.

**Why:** Treating an `fva` value as an epoch timestamp made valid verification state fail and prevented Clerk’s client reverification flow from opening.

**How to apply:** Use first-factor age for member reauthentication and second-factor age for staff MFA. Pair the server hint with Clerk’s client reverification wrapper so the original request retries after successful verification.

Generated clients throw `ApiError` for the structured HTTP 403 hint. Clerk's
reverification wrapper recognises a resolved hint (or its own SDK error), not
that transport wrapper. Unwrap only the exact Clerk hint for the wrapper; keep
ordinary errors rejected, and check actual request acceptance before clearing
data or treating a retried response as success.

**Why:** A valid server hint hidden inside a generic transport error prevented
the secure reauthentication modal from opening.