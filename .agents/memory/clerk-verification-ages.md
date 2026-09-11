---
name: Clerk verification ages
description: Non-obvious Clerk factor-age and reverification behavior used by sensitive Me account operations.
---

Clerk session `fva` entries are ages in minutes, not timestamps. Sensitive routes should evaluate the appropriate factor age and return Clerk’s structured reverification error when it is too old.

**Why:** Treating an `fva` value as an epoch timestamp made valid verification state fail and prevented Clerk’s client reverification flow from opening.

**How to apply:** Use first-factor age for member reauthentication and second-factor age for staff MFA. Pair the server hint with Clerk’s client reverification wrapper so the original request retries after successful verification.