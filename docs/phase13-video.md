# Phase 13: video safety and operation

## Limits and recovery

Reels: MP4, WebM or QuickTime, at most **64 MiB**, **120 seconds**, portrait or
square. Video posts: the same containers, at most **200 MiB**, **600 seconds**.
Server probing is authoritative: one video stream, at most one audio stream,
16–4096 pixel dimensions, up to 60 fps, no extra subtitle/data/attachment streams.
Magic bytes must match the declared container. Rotated phone video is measured
using its displayed orientation.

Upload recovery **restarts the entire file**; it is not byte-resumable. A signed
PUT lasts five minutes, and incomplete upload records expire after 24 hours.
The same owner, asset and idempotency key can recover an interrupted upload.
The browser stores an account-scoped manifest, not video bytes, tokens or URLs.
An interrupted upload asks for the same file again; completed processing/held
uploads recover without the original file. Logout/account change clears local
state and aborts in-flight uploads. There are at most three uploading/processing
videos per member and member-scoped request limits.

Completion freezes an immutable private source before it queues processing.
Background jobs are database-backed, claim with row locks and skip-locked,
have a 30-minute lease, and retry operational failures at most three times.
Expired leases recover after restart. A dedicated persistent worker is preferable
for high traffic; an autoscaling instance may pause when no requests are active.
Status polling keeps the current upload journey active, but this is not a
guarantee of a production processing SLA.

## Processing and playback

FFmpeg/FFprobe are declared system dependencies. Inputs are restricted to local
file/pipe protocols and MOV/MP4 or Matroska/WebM demuxers; no playlists, remote
fetches, user-supplied command flags or shell interpolation. Temporary directories
are private and removed in `finally`. Downloads have a size cap and one-minute
deadline; processors have individual timeouts, bounded diagnostic output,
single-thread decoding/encoding and a 64 MiB individual allocation cap.
Application credentials are not passed to child processes.

Outputs: H.264/AAC fast-start MP4 standard (up to 720 pixels on either dimension)
and low-data (up to 360 pixels), a VP9/Opus WebM fallback (360 pixels) for browsers
without H.264/AAC, a JPEG thumbnail, a bounded temporal contact sheet,
and a complete AAC audio track when audio exists. Metadata/chapters are stripped.
Bitrates and output file sizes are capped. All playback durations must match
the complete input within 250 ms; truncated output never qualifies for review.
Object ownership is registered before derivative upload for crash-safe cleanup.
Original video is never delivered through the normal media route.

Every standard/low/WebM/thumbnail/captions/transcript request authenticates and
re-evaluates original post/share, current audience, circle/group membership,
friendship, either-direction blocks and message authority where applicable.
There are no public/signed GET links. Byte ranges support seeking, use private
no-store responses and cap an individual requested range at 4 MiB.
Held derivatives are accessible only to their uploader or reason-scoped,
fresh-MFA/capability-authorised staff.

Native HTML video streams after explicit play; it does not first download a
whole-file blob. Low-data and lower quality default on, autoplay defaults off.
Autoplay is muted, opt-in and suppressed for reduced-motion/data-saving requests.
Offscreen, hidden-tab and pagehide events pause playback; foregrounding does not
resume it. Finite chronological reels have visible Previous/Next controls,
swiping and explicit Load More; end-of-video never advances to another reel.
Reactions, comments, saves and reports reuse existing post permissions.

## Moderation coverage: deliberately fail closed

1. Malware: stream the **full immutable source to a private ClamAV daemon**.
   An absent executable, missing/unusable signatures, timeout or scanner error
   is unavailable, **not clean**. A virus finding is blocked.
   Development scanning and official signature updates are configured; see
   `malware-screening.md` for limits, health checks, tests and remaining release gates.
   No decoding, thumbnails or playback variants are produced before malware
   screening allows the exact frozen source. Unavailable scans retry later.
2. Temporal frames: at most 120 frames, sampled every
   `max(1, ceil(duration / 120))` seconds, form staff review evidence.
   There is no configured automated frame-abuse provider; this result is recorded
   as unavailable. A thumbnail or sampled contact sheet **does not screen an
   entire video** and cannot authorise publication.
3. Audio: the complete soundtrack is extracted separately. There is no configured
   automated audio-abuse/speech provider; this result is recorded as unavailable.
   A silent upload is not assumed from missing captions. No captions/transcript
   are automatically invented.
4. Human coverage: an independent moderator must access the exact current
   derivative with a recorded reason, attest to watching the **entire processed
   video** and listening to its **complete audio**, and review the current
   captions or explicit no-speech declaration. The server records reviewer,
   reason, time, coverage and caption version. This is a documented human review
   path, not a claim that automated checks covered every original frame or claim.
   A human decision **cannot waive blocked or unavailable malware screening**.

All processed uploads start held. Only completed processing, malware `allowed`,
and independent full human video/audio review of the exact caption version can
make them ready. Test-only malware outcomes require `NODE_ENV=test` plus an
explicit test flag; they are unavailable in production.

Caption corrections validate finite, ordered, non-overlapping cues within the
duration, escape VTT markup and provide plain-text transcripts. They increment
the revision and hold the asset again. Stale decisions and self-review fail.
Ready media alone can attach/publish, so pending media cannot become public
through a post, reel or share.

## Deletion and retention

Account-deletion hooks remove originals, staging objects, every derivative and
job. Post deletion queues unreferenced video cleanup; shared/live attachments
prevent premature deletion. Cancelled, expired and cleanup-failed objects are
retried by a registered cleanup timer. Variant rows and deterministic frozen
source paths make interrupted processing discoverable for cleanup.
Independent cleanup tombstones survive asset/account deletion and retry expired
signed-PUT paths for 24 hours, so a late upload does not become an untracked
staging object. Production storage lifecycle rules should also expire abandoned
staging objects; that operational safeguard remains a release check.

Existing retained report evidence and message-report/context snapshots prevent
ordinary media cleanup from deleting their referenced bytes. This guard does
not implement the separately proposed legal-hold governance work or invent a
retention period. Required evidence must be released through the approved
retention process, not a video cancel/delete button.

## Verification and release gates

- Development schema applied; shared libraries, API and frontend type checks pass.
- Full API regression suite: 114 tests passed, including real FFmpeg processing,
  immutable completion despite overwritten PUT bytes, unavailable-provider holds,
  independent/fresh-MFA review, caption revision conflicts, all private playback
  variants, range seeking, friendship/block permissions, reels and deletion.
- Browser verification covers the changed upload/playback/recovery journey;
  see `ACCEPTANCE.md` for the final observations and any environment limitations.
- **Real native iOS/Android devices have not been tested.** There is no native
  app artifact in this project. Mobile browser viewports are not native-device
  validation. Before a native release, test real-device recording/MOV rotation,
  large-file recovery, codec playback/captions, slow/offline networks,
  background/foreground, memory use and deletion.
- **Not production-approved:** development malware scanning has passed real-engine
  verification, but production scanner/worker operation, moderation staffing/SLA
  and native-device checks remain release gates. The scanner setup did not change
  production hosting or publish the app.
