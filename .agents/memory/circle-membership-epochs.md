---
name: Circle membership epochs
description: Privacy rules for invitation-only circle membership, historic-post access, and revocation.
---

Circle membership must be treated as a new authorization epoch whenever someone
joins. An earlier-history grant belongs only to the current active membership:
removing, leaving, closing, or blocking revokes it, and accepting a later
invitation must not silently restore it.

**Why:** Restoring an old grant after a person rejoins would disclose posts that
were intentionally withheld at the time of their new invitation.

**How to apply:** Use the database timeline for both invitation acceptance/join
time and circle-post publication time. Evaluate live membership and history
grants on every server read rather than treating author ownership, friendships,
or a past membership as an override.