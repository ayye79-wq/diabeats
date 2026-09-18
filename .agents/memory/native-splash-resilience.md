---
name: Native splash resilience
description: Prevent optional font loading from blocking native app startup indefinitely.
---

Native startup must reveal the app after a short bounded wait even when an optional font asset has not resolved. Render with the system fallback font rather than preserving a blank splash screen.

**Why:** The embedded iOS simulator can obtain the Metro bundle while font resolution remains delayed, making an otherwise healthy app appear stuck on its white launch screen.

**How to apply:** Keep splash hiding tied to successful or failed font loading, but retain a small timeout escape hatch. Any new startup prerequisite should use the same bounded-ready pattern instead of keeping the root layout empty forever.