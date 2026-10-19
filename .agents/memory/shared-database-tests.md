---
name: Shared database integration tests
description: Live background workers can consume disposable integration-test media jobs.
---

Pause the managed development API before integration tests that use the shared
database with in-memory object adapters, then restore its managed workflow.
Never introduce an authentication bypass or weaken screening to isolate tests.

**Why:** A live video worker can claim a fixture job before the test's own worker,
then attempt to read its synthetic path through the real storage adapter. This
causes intermittent failures despite correct isolated behavior.

**How to apply:** Isolate worker-sensitive tests from the running development
service. Preserve passing unrelated checks; rerun only the affected flow when a
known worker race occurs. Always restart and verify the actual app afterward.
