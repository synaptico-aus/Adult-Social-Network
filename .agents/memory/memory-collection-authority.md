---
name: Memory Collection authority
description: Product privacy and non-clinical boundaries for curated memories.
---

A collection must not widen an item's original audience. Treat curator access
and viewer access as separate requirements: revoking the curator's source access
must stop that collection distributing the source, even to a viewer who could
independently access the original. Collection ownership is not source ownership.

**Why:** The user requires inaccessible/deleted sources to become unavailable
throughout collections, not to survive as copied memories or new permission grants.

**How to apply:** Preserve this boundary in viewing, playback, reminders, exports,
future sharing and caching. Other authors' material and copyrighted music remain
references in exports, not a new library of copied content.

Collections are not treatment. The user prohibits memory-performance scoring,
clinical quizzes, fabricated events and generated replacement memories. Resurfacing
requires explicit consent, individual hiding and a global reminder opt-out.

**Why:** The user explicitly set these product boundaries for Memory Collections.

**How to apply:** Apply them to later reminder, recommendation, AI and personalisation
work; do not reinterpret a navigation item counter as a clinical score.

Privacy redaction on fetch errors must not evict an actively observed query in
an error-driven loop.

**Why:** With the app's query observers, eviction on a persistent unavailable
response can recreate the query immediately and turn finite refresh into a
request storm. Hiding stale content and cancelling unwanted requests are separate
from deleting the observer's cache record.

**How to apply:** Suppress revoked/error content at render time, clear local
drafts, and use bounded refresh. Opt-out can cancel requests and empty reminder
data without repeatedly removing the mounted query.
