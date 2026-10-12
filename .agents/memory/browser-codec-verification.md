---
name: Browser codec verification
description: The test browser can advertise MP4 containers without an H.264/AAC decoder.
---
Do not diagnose `MEDIA_ERR_SRC_NOT_SUPPORTED` as an authentication or byte-range
failure merely because private MP4 playback fails in the browser test runner.
Check exact codec support and the returned bytes separately.

**Why:** The test browser reported MP4 container support but no H.264/AAC support,
even though authenticated 206 responses contained valid MP4s that decoded fully
with FFmpeg. VP9/Opus playback worked in that same browser.

**How to apply:** Check `canPlayType` with exact codecs, keep a private portable
fallback, and distinguish codec limits from permission failures. A successful
headless/mobile-viewport test still does not replace native-device checks.
