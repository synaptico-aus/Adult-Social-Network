---
name: Clerk browser MFA verification
description: Test-helper sign-in success is not evidence that fresh-MFA claims were applied.
---

Do not treat a test-helper sign-in URL as proof of fresh-MFA claims. The available
Clerk browser sign-in helper did not document a claims override; supplying an
extra claims argument returned a URL but did not establish valid fresh-MFA
access. Mark protected browser coverage unverified unless the required claims
and successful guarded access are actually observed.

**Why:** An unsupported argument can appear accepted while the guarded staff
journey remains inaccessible. Weakening production MFA to make browser tests
pass would change the security boundary rather than verify it.

**How to apply:** For staff browser tests, use a supported method that establishes
fresh factor verification. Keep DB-backed middleware/lifecycle tests distinct
from browser verification, and report a helper limitation honestly.
