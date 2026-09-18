---
name: RevenueCat startup recovery
description: Reliability rule for purchase and restore actions when native subscription initialization is delayed.
---

RevenueCat purchase, offering-refresh, and restore actions must be able to initialize the native SDK on demand instead of depending only on app-start initialization. Retrying store reads and restore is safe when bounded, but never retry the purchase transaction itself.

**Why:** On TestFlight, a user can open the paywall before asynchronous session and RevenueCat setup finishes. A startup-only readiness flag then produces a misleading “purchases unavailable” failure even though the native module and store configuration are valid.

Premium activation must require the canonical RevenueCat entitlement lookup key `premium`; the project also contains a legacy entitlement attached to some of the same products. Webhook events must be applied monotonically using their provider event timestamp so delayed retries cannot overwrite newer subscription state.

**Why:** Accepting any active entitlement can grant the wrong access, while out-of-order expiration and renewal webhooks can incorrectly revoke or re-grant Premium when only a Boolean is persisted.

**How to apply:** Route every user-triggered store action through one shared, concurrency-safe readiness step. Retry idempotent offering and restore calls briefly, never retry checkout, treat every error after StoreKit success as confirmed-but-syncing, require `premium`, and reject stale webhook state transitions.