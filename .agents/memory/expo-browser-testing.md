---
name: Expo browser testing
description: Project-specific Playwright runner and validation environment constraints.
---

The repository’s browser suite can target the static Expo app served by the backend. The dedicated browser tester is the reliable execution path when the local Chromium shell cannot load system libraries; the local CLI can still verify test discovery and configuration.

**Why:** The preview browser and the local headless Chromium do not necessarily share system dependencies, so a local launch failure does not establish that the application or test plan is broken.

**How to apply:** Keep browser tests discoverable with `npx playwright test --list`; use the project browser tester for real UI execution when the local binary reports missing shared libraries. When changing Expo UI source, rebuild the static export and restart the backend before browser checks: Playwright reuses a running server and otherwise serves the prior bundle.