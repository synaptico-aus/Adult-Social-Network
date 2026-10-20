---
name: Member privacy expectations
description: User requirements for friend-specific profile and media interaction controls.
---

Me members must be able to choose which connected friends can see particular
profile information, posts, pictures and other media, and control permission
to view, like/react, share and comment.

Use saved defaults for each friend, plus per-post restrictions. A post cannot
restore an ability denied by a saved default.

**Why:** The user explicitly requested selection from the friends list and
separate interaction permissions, not just a general connections audience.
They selected friend defaults plus per-post restrictions.

**How to apply:** Treat visibility, reacting, commenting and sharing as separate
permissions. A display preference that hides counts is not permission to disable
reactions. Enforce restrictions on the server and private media paths, not only
by hiding buttons, and never widen a source audience through a share.
