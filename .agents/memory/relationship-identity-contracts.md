---
name: Relationship identity contracts
description: Why discovery results must carry action-specific relationship identifiers.
---

Discovery responses used for relationship actions must include the target member
identifier and, when a request is pending, its actual request identifier.
Profile identifiers and placeholder request identifiers must never be used for
friend, follow, block, accept, decline, or cancel actions.

**Why:** A privacy-filtered profile can legitimately omit its member link, and a
profile row has a different identity from a member. Direction-only request state
is also insufficient for endpoints that authorize a specific request.

**How to apply:** When adding a relationship action to search, suggestions, or
another discovery surface, make the server response carry every authorized
resource identifier needed by that action and consume those fields directly.