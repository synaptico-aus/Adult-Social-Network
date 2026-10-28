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

Reviewing a new friendship must account for older Friends-audience posts, not
just future posts. Save deliberate defaults atomically with acceptance, and
protect against stale saves from an already-open settings screen in either order.

**Why:** Accepting first and restricting afterward can briefly expose older
content; a stale whole-map settings save can silently erase the new restrictions.
An exposure cannot be undone by a later successful restriction.

**How to apply:** Preserve the shared member-pair then privacy lock order, check
the defaults the member actually reviewed, and ask for a fresh review on conflicts.
Do not silently retry with newer defaults or claim a failed save was applied.
