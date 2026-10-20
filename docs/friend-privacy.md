# Friend-specific privacy

## Member controls

In Profile Privacy, save View, React, Comment and Share defaults for each
connected friend. Post composers can restrict these abilities further for an
individual post, including its media. A post cannot override a denial in the
saved defaults or broaden its underlying audience.

Profile fields keep their existing audience cap and can additionally be limited
to selected connected friends. Enabling a selection saves the connections cap
and selection together. An empty selection means nobody else, not everyone.
Removing a friendship removes selected-field access; selecting a person is not
itself a friendship or access grant.

Changes apply to existing posts on subsequent authorised requests. They cannot
recall material already viewed, copied, downloaded or screenshotted, nor remove
independent permissions from material deliberately shared through another route.
Share controls govern Me's reshare operation, not copying a browser address.
Protected deep links still require sign-in and the original audience.

## Enforcement

The effective capabilities are the intersection of saved friend defaults,
post-specific restrictions and existing audience/block/circle/group/moderation
rules. Without View, no interaction is permitted. Closing comments remains an
additional restriction. Owner management is retained.

Reaction, comment and reshare writes recheck live permissions inside their
transaction. Lock ordering is member pair, author privacy advisory lock, then
post row. Settings changes acquire the matching exclusive privacy lock; this
also serializes permissions before a profile record first exists.

Private media originals, thumbnails, variants, captions and transcripts retain
their common live media-authorisation boundary. Collections continue to recheck
source posts. Reshares become unavailable when their sharer's source share
permission is revoked.

Only the owner receives saved friend-selection maps. Other viewers receive
effective capabilities, not another person's friend list. Profile discovery and
suggestion fields use filtered profile data. Selection data is included with
owned profile/post exports. The profile deletion hook removes the deleted
member's references from other profiles/posts without converting empty
selections into unrestricted access.

## Verification and limitations

Regression coverage includes defaults versus per-post caps, separate
interactions, persistence, cross-account denial, media revocation, reshare
revocation, signed-out deep links, friendship removal, selection privacy,
deletion cleanup and overlapping reaction/privacy writes.

These are synthetic development fixtures, not consented beta participation or
evidence of native-device validation. Signed-in browser validation still needs
an eligible test account and readable approved onboarding policies. Existing
upload/video release holds are unchanged. Legacy profile-photo delivery remains
owner-scoped; these controls do not enable it for other members.
