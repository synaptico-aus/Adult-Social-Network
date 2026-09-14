---
name: Group block and host boundaries
description: Durable authorization rules for group membership and community welcome access.
---

Group joining and approval must check bidirectional blocks against every active
member, not only the owner or moderator. Blocking uses owner-safe separation:
an owner removes the blocked member; otherwise the blocker leaves the shared
group.

**Why:** Checking only the owner allowed blocked non-owner members to end up in
the same group through direct joining or delayed approval.

**How to apply:** Serialize block, join, and approval decisions with one
canonical member-pair ordering, then re-read membership and block state before
granting access.

Community welcome authority requires three live conditions: independent active
training, an active assignment to the exact group, and active group membership.

**Why:** A profile role, moderator role, or stale assignment is not evidence
that someone is currently trained and accountable for that queue.

**How to apply:** Re-check all three conditions on every queue read,
acknowledgement, and closure. Availability messaging must use controlled
non-guarantee templates rather than free-form response deadlines.