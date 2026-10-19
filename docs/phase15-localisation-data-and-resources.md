# Localisation, data use and country resources

## Language release gate

Only `en-AU`, `en-GB` and `en-US` are enabled. They share the existing canonical
English interface and English moderation process; regional formatting is not a
claim that a new moderation language is supported. The release catalogue records
its engineering review date, review scope and moderation limitations.

Arabic, Spanish and French are visible as **unavailable**, not selectable
production languages. Engineering review is not independent linguistic or clinical
certification. Before adding any language:

1. Complete interface-string extraction, translation and missing-key checks.
2. Obtain qualified linguistic/accessibility review of every exposed string.
3. Establish documented operational human moderation, reporting, escalation and
   applicable automated coverage for that language, including response availability.
4. Review health education separately and approve exact translated revisions.
5. Test text expansion, native fonts, bidirectional content and narrow layouts.

The common interface catalogue, member preferences, locale-format helpers and
document `lang`/`dir` provide the infrastructure. Non-extracted existing copy remains
canonical English. RTL is currently an explicitly labelled **layout preview**,
not an enabled Arabic interface. Logical spacing/borders and directional icons
follow document direction.

## Dates, time zones and quiet hours

Locale/time-zone preferences are account-scoped and persisted on the server.
Date/time helpers use `Intl` and validated IANA zones. Calendar-only source-check
dates remain the same calendar day across zones; timestamps display in the
member's selected zone.

Notification quiet hours keep a separate explicit zone. A member may deliberately
copy the experience zone into them; changing display locale/zone does not silently
change notification scheduling. Times are valid `00:00`–`23:59`, overnight periods
work, and local wall-clock evaluation follows daylight saving. Equal start/end
means a full quiet day. PATCH requests contain only editable settings, never
member IDs or database timestamps.

## Translation privacy and publication

There is **no translation provider integration**. No original, private message,
draft or story is sent to an external translation service, and the client cannot
enable one. Manual community submissions require permission/rights confirmation
and explicit machine-assisted provenance. A future provider requires a documented
privacy/consent basis and data-processing/retention review before any connection.

Original posts/lessons are never overwritten. Translation panels retain the
original view, identify machine-assisted versus submitted human-origin text,
show review status/reviewer/date, and provide correction and reporting forms.
Machine provenance cannot be removed by correcting a machine-assisted submission.

Submissions start pending. Publication requires a different author, reviewer and
publisher, fresh staff MFA and the relevant education review/publish capability.
That stricter workflow is used for ordinary translations too. Review notes are
required. Source hashes and education revision IDs bind approval to the exact
original; edits, withdrawal, overdue original education review and lost source
access suppress the translation. Source permission is checked for the viewer and
submitter on reads and staff actions. Staff membership does not grant access to a
private source. Proposed corrections do not replace an approved version until
independently reviewed and published.

Account exports apply the same source checks to submitted translations; revoked,
stale or removed originals yield an unavailable reference rather than their text.

Reports are shown with their reasons in the staff review queue and prioritised
ahead of unreported entries. The queue supports removal. Open translation views
refresh every five seconds/on focus and hide cached translations on errors,
without deleting an actively observed query and causing a request loop.

## Low data and controlled media

Text-first and low-data are on by default. While either is on, photos, avatars,
audio, video and thumbnails are withheld until a deliberate Load/Play action.
Hiding an already loaded element with CSS is not the mechanism: no media element
with a source is created until permitted. Choices are scoped to account, source
URL and gate state. Autoplay and video thumbnails are disabled while gated;
existing playback/quality preferences continue to apply after a deliberate load.

## Drafts and offline limits

The post composer preserves unsent text and audience in tab memory, including
failed-network attempts and navigation. Restoring a found draft is deliberate;
it is never automatically published. A member may explicitly save a private
server draft for later authenticated restoration. Server draft writes recheck
active membership under the member lock, and export/deletion includes these data.
The audience selector is controlled by restored form state. Restoration also
requires the original Home/circle/group context; a mismatch leaves the draft
available and refuses to silently substitute another audience.

Offline drafts are optional and off by default. When enabled:

- AES-GCM encrypts a per-account device draft with fresh nonces.
- Ciphertext alone goes in account-scoped local storage.
- The encryption key is account-scoped session storage, not durable storage.
- Generation/identity checks prevent late encryption/key/server responses from
  writing after an account change or wipe.
- Logout, account switch and known inactive/deleted-account responses erase local
  drafts/keys and notify other tabs, including a storage-event fallback.
- Closing the tab may destroy the only key; that encrypted copy can then be
  unrecoverable. Explicit account saving is the reliable cross-session option.

This is not an OS keychain and does not protect a signed-in compromised browser
from same-origin malicious code. Shared devices should leave offline drafts off.
The app does not add a service worker or cache private source/feed/media content
for offline viewing. Account switching remounts local forms as well as clearing
query data; a delayed settings response cannot populate the next member's cache.

Offline revocation cannot retract bytes already seen/copied or immediately erase
an unreachable device. An offline tab cannot learn that an account was deleted
elsewhere until it reconnects; explain this limitation rather than promising
instant remote deletion. Local cache cleanup and server-owned draft deletion are
separate operations.

## Curated directory

The initial directory covers Australia, the United Kingdom and the United States.
It is public, so people do not have to complete account setup to find support.
Members deliberately choose the country they are physically in; language,
device/display time zone and the default account country do not establish location.
No emergency numbers load automatically from a guessed country.

Each entry includes its original official source, telephone number, actual
channel-specific hours, relevant time-zone description, check date and limitations.
The directory does not claim that a service is open right now or that reviewing
a source verifies every claim. Me does not monitor emergencies or dispatch help.

Sources checked on **19 October 2026**:

- Australian Government Triple Zero information:
  https://www.infrastructure.gov.au/media-communications/phone/triple-zero
- Dementia Australia National Dementia Helpline:
  https://www.dementia.org.au/get-support/national-dementia-helpline
  — phone `1800 100 500`, 24/7/365.
- NHS emergency calling guidance:
  https://www.nhs.uk/nhs-services/urgent-and-emergency-care-services/when-to-call-999/
- Alzheimer’s Society Dementia Support Line:
  https://www.alzheimers.org.uk/get-support/dementia-support-line
  — `0333 150 3456`, Mon–Wed 09:00–20:00, Thu–Fri 09:00–17:00,
  Sat–Sun 10:00–16:00, UK local time; holiday exceptions should be checked.
- US emergency calling guidance: https://www.911.gov/calling-911/
- Alzheimer’s Association Helpline:
  https://www.alz.org/help-support/resources/helpline
  — phone `800.272.3900`, 24/7/365; live-chat hours differ.

Maintainers must recheck original sources before changing an entry and update its
check date truthfully. Entries are deliberately curated release data, not a live
provider-status feed or automatic verification service.

## Verification

The backend regression suite passed **141 tests**, including nine Phase 15
integration tests for reviewed-locale gates, account isolation, unpublished
drafts/export/deletion, time-zone validation, overnight/DST quiet hours, country
sources, translation rights/provenance/review/publication/reporting, private
originals and withdrawn health education.

Nine focused browser-independent client tests cover regional dates, calendar-only
dates, editable-only notification payloads, ciphertext-only storage, restoration,
cross-account rejection, logout/deletion purge, asynchronous key-generation races
and cross-tab cleanup without BroadcastChannel.

The focused browser pass used two fictional accounts and ordinary onboarding and
sign-out/sign-in. It verified persisted locale/time zone/RTL, disabled unreviewed
languages, a 320px layout without document overflow, country numbers/hours/source
dates, an emulated offline encrypted-draft recovery, explicit private server-draft
recovery, no raw draft text in browser storage, and account-switch cleanup without
the previous member's settings or draft appearing.

The pass found and corrected notification payloads containing server-owned fields
and an uncontrolled audience selector. A narrow recheck confirmed quiet-hour
zone sync and enabled 22:00–08:00 persistence after reload, and **Only Me** after
both device and server draft restoration. Test drafts were deleted and test
settings restored; no post was published.

No approved media fixture was available, so this pass did not verify media loading
against an actual approved asset. Its request probe observed no media downloads,
but that is not proof of every player path. Translation publication/permission
cases were covered by backend tests, not a browser staff-review journey. No
native-device claim is made by browser emulation or viewport tests. Existing video
publishing/operational moderation release gates remain unchanged.
