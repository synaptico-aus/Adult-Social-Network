---
name: Messaging authority locks
description: Durable concurrency and history rules for direct and group-linked messaging.
---

Acquire canonical member-pair locks before group-authority locks, then lock the
conversation. Re-read blocks, group membership, conversation membership, and
attachment state only after these locks.

**Why:** Live read checks alone allowed a group removal to commit between message
authorization and insertion. A shared coarse group-authority lock makes a
completed removal imply that no stale in-flight send can commit afterward.

**How to apply:** Every linked conversation mutation and every underlying group
membership lifecycle mutation must use the same group-authority lock. Never hold
that lock and then wait for a member-pair lock.

Notification creation for a linked conversation belongs inside the same live
authorization boundary as sending. A removed recipient must receive neither an
inbox row nor a delivery-queue row.

**Why:** Suppressing an inaccessible notification only when listing the inbox is
too late; an external delivery worker may already have processed its queue row.

**How to apply:** Reauthorize recipients and insert notification/outbox records
atomically under group authority. Rejoining uses the later current group and
conversation membership timestamps as the history cutoff.