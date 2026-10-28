---
name: Localisation release and privacy boundaries
description: Language approval, provider privacy and offline-draft product constraints.
---

Me's initial launch country is Australia.

**Why:** The user selected Australia when asked which country to launch in first.

**How to apply:** Scope initial policy and legal-readiness work to Australia.
This is a launch intention, not evidence of legal approval or permission to
enable a region, and does not determine any individual member's location.

Enable an interface language only after reviewed strings and documented
operational moderation coverage exist. Regional English formats are the same
English-language release, not evidence of coverage for another language.

**Why:** The user explicitly required reviewed interface strings and documented
moderation coverage, and separately required review of translated health education
before publication.

**How to apply:** Do not enable a new locale with a generated dictionary alone.
Keep layout-direction testing distinct from claiming a reviewed RTL language.
Keep original content and translation provenance; corrections cannot erase a
machine-assisted origin.

Do not send private content to a translation provider without an established
privacy/consent basis. Local offline drafts are not permission to cache private
source content or promise instant offline revocation.

**Why:** The user requires privacy-safe translation, account-scoped protected
offline data, cleanup on logout/deletion and an explanation of revocation limits.

**How to apply:** Gate any future provider connection before making requests.
Separate server drafts from device cache; preserve account-boundary and late-write
protections. An offline device cannot immediately learn a remote permission change.

Country resources must reflect the person's actual chosen country, not infer
location from language or display zone; Me must never imply emergency monitoring.

**Why:** The user requires actual support hours and local emergency resources,
without positioning Me as an emergency service.

**How to apply:** Verify official channel-specific hours and check dates when
updating the directory; do not silently guess where a member is.
