---
name: Expo 54 dependency compatibility
description: Security upgrade constraints and compatibility rules for the current Expo 54 toolchain.
---

Treat an Expo SDK migration as a release-sized project, not a routine dependency update. When an audit reports an Expo/Metro advisory without a forward compatible fix, record the vendor limitation and revisit it when a compatible release is available.

**Why:** The Expo dependency line coordinates Metro, React Native, native modules, and the build pipeline. A complete SDK upgrade can still leave advisories whose only listed “fix” is a regression to an older release.

**How to apply:** Validate navigation, native modules, linting, types, production builds, and the mobile browser flow after an SDK change. Do not downgrade to an older Expo line solely to silence an advisory; document and periodically reassess a user-approved upstream exception instead.