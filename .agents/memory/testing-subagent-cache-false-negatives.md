---
name: Testing subagent cache false negatives
description: A persistent tester's browser session can serve stale data across follow-ups, producing a "failure" verdict for an already-fixed bug.
---

A testing subagent session (`sendFollowup`) keeps its browser/session state
across calls. After a server-side fix + backend restart, a follow-up on the
*same* tester session can still report the old broken behavior even though
the fix is verifiably correct server-side — the browser's own cache (or
in-memory client state) can be serving a stale response rather than making a
fresh network round-trip.

**Why:** this produced a confusing repeat "failure" verdict on an
ingredient-classification fix that a direct server-side test (calling the
same function/logic path with a real API request, bypassing the browser)
proved was already correct.

**How to apply:** when a testing subagent reports a "failure" that seems to
contradict server-side evidence (unit tests, a direct authenticated API call
via curl/fetch), don't just retry the same persistent session. First verify
independently server-side; if that confirms the fix, spin up a *brand new*
subagent with `[New Context]` (a genuinely fresh browser context, not a
follow-up) before concluding whether the bug is real.
