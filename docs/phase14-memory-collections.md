# Memory Collections

## Product boundary

Memory Collections organise existing permitted material. They are not treatment,
clinical quizzes or memory-performance scores. There is no generated substitute
content, invented event history or automated reconstruction of missing memories.
Previous/Next and the item count are navigation, not an assessment.

## Sources and permissions

- Collections have names, optional per-item captions and a saved order.
- Sources are published stories, ready photos/voice recordings attached to a
  permitted published story, and reviewed music links from the resource catalogue.
  Creating/uploading new source material still uses the existing Home upload,
  screening and publication flow. Collections cannot bypass a held upload.
- Private (`only_me`) is the default. Other choices are friends, a selected circle,
  a selected group and public. All collection routes, including public collection
  links, require authentication and an active account.
- Creation into a shared audience and changes to the audience/scope require
  explicit `shareConsent`. Circle/group choices require current membership.
- Collection visibility and **both curator and viewer source permissions** are
  checked on reads. Losing curator access makes that reference unavailable even
  to a viewer who could separately visit the original. Source permissions use
  existing live block, audience, membership/history and moderation rules.
- Media must remain ready and attached to the selected original post. Each actual
  playback/image request also goes through existing private media authorisation.
- Source deletion, removal, revoked access or an unready asset yields only a generic
  placeholder. Source IDs, captions, text, author, title, URLs and transcripts are
  not included in that placeholder.
- These are references, not snapshots or grants. Original deletion/retention
  decisions are not extended by collection membership.

The owner can still manage their own collection metadata after leaving a circle;
that does not restore any source content. Existing circle-history epochs govern
shared collections as well as their source posts.

## Viewing and editing

The Memories navigation opens `/memories`; a collection opens at `/memories/:id`.
Sources have author/source attribution, original links, photo alternative text and
available voice transcripts. Audio uses native play/pause controls, starts only
when requested and pauses on page backgrounding. Previous/Next is always visible.
Music opens the original external link: no automatic embed, download, audio copy
or copyrighted rehosting is introduced.

Only the owner can rename, add/edit captions, reorder, remove references, change
sharing, export or delete a collection. Reorders must be an exact permutation
of the current item IDs and are saved under the collection lock. A collection
has at most 200 items. Listings are bounded to recent owned/shared collections.

Names and captions are screened together within the same transaction as each
edit. A held caption cannot be bypassed by renaming. Collection sharing approval
is bound to its metadata revision, rather than a timestamp-sorted older approval.
Held metadata is owner-only; editing/removing the offending text rechecks sharing.

Open views refetch every five seconds and on window focus. Errors suppress cached
content. Revoked/hidden items also lose their local caption drafts, and their media
element unmounts. Polling preserves edits for still-permitted sources. As with other
web views, access cannot retract content a person already legitimately saw or saved.

## Optional reminders

Reminders are **in-page only**, on the Memories page. There is no email/push queue,
daily scheduler or automatic third-party notification in this phase.

They default off. Enabling requires explicit consent, recorded with its date.
Up to three existing selected memories can then be shown; no fabricated
descriptions, scores or clinical questions are generated. Every reminder checks
live collection/source access, and consent is checked again before returning it.

“Hide this memory for me” applies to the same source across that member's
collections and reminders, without changing anyone else's access. Hidden items
can be restored. “Disable all reminders” clears consent and immediately suppresses
the reminder response/UI, including after reload. Other sessions observe changes
through the same finite refresh and focus behaviour.

## Export and deletion

An owner can download a JSON collection export. Own permitted story text, own
captions and original references are included. Other authors' text, images and
voice transcripts are not copied into that export: those items are references with
permitted attribution. Music remains a link. No original media file is packaged.
Unavailable sources stay unavailable in exports.

Account export includes owned collections, reminder preferences and personal
hidden-memory settings, with the same source/ownership checks. Concurrent metadata
changes fail an export instead of silently omitting a collection.

Removing an item/deleting a collection deletes only its reference and caption,
never the original story or another person's content. The account deletion hook
removes owned collections, item references and reminder/hide settings. Other
people's collections retain only unavailable placeholders when a deleted account's
original source is no longer accessible. Existing evidence-retention rules remain
the authority for original posts/media.

## Verification

Backend regression suite: 132 tests passed, including 11 dedicated collection
tests covering:

- private defaults, explicit sharing, ownership and original-only-me sources;
- revoked friendships and curator access;
- circle removal, rejoin/history and collection audience revocation;
- deleted sources and suppressed attribution/captions;
- live ready-media attachment/transcript authority and removed music links;
- explicit reminder consent, cross-collection hides, opt-out and source revocation;
- exact reordering, caption revisions and moderation holds;
- reference-only foreign exports, account export and deletion hooks.

API/web TypeScript checks passed. Browser findings are recorded separately after
the focused end-to-end run; viewport testing is not native-device certification.

The focused browser pass verified desktop and 390×844 mobile layout, normal
onboarding, collection creation/caption edits/reorder/Previous/Next, reference-only
removal, JSON download, deletion without removing originals, explicit sharing,
private-source placeholders for a second viewer, consent/hide/disable/reload, and
live source-deletion redaction (including owner caption drafts). Test material was
cleaned up without changing unrelated collections.

The run also exposed an error-driven query-eviction loop after collection deletion.
The client now keeps the mounted query, suppresses its stale data, and uses bounded
refresh instead of recreating it. The same pattern was removed from reminders.
Actual image/audio payload revocation and friendship/circle changes were covered
by backend integration tests, not independently by this browser fixture.

Targeted follow-up confirmed the deleted-collection fix: a 10.659-second
observation made three 404 requests approximately five seconds apart and kept
the explicit unavailable state, with no stale content or skeleton loop.
