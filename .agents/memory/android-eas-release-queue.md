---
name: Android EAS release queue
description: Durable handling for slow EAS Android production builds and exact Google Play submissions.
---

EAS Android production builds may remain queued or in progress for an extended period before producing the AAB. Keep polling the original build ID, never start a duplicate while it is active, and submit only the finished artifact to the configured Google Play track.

**Why:** A slow queue can look stalled even when the build is healthy; duplicate builds create unnecessary version-code and release ambiguity.

**How to apply:** Increment the Android version code before a new store build, wait for `FINISHED`, then use the exact build ID with the managed Google Play service-account flow. Remove the temporary credential file after submission.