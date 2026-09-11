---
name: Content moderation transactions
description: Durable publication and reporting boundaries for editable protected content.
---

An approval applies only to the exact content revision that was screened.
Published body changes must write the new body and its screening result in one
transaction; an older approval must never authorize replacement text.

**Why:** Reusing an earlier approval creates a moderation bypass, while committing
screening in a nested transaction can leave a decision attached to text that
never committed.

**How to apply:** Let moderation intake accept the caller's transaction executor.
Use explicit automated `allowed` or `held` publication outcomes. Keep a pending
member report separate from publication visibility until an authorized staff
decision changes the moderation state.