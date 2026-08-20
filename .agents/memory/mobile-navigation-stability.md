---
name: Mobile navigation stability
description: Why DiabEats uses stable Expo Router tabs rather than the liquid-glass native tab experiment.
---

Use the standard Expo Router `Tabs` navigator across all platforms. Do not reintroduce the experimental liquid-glass / unstable native-tabs branch without validating it in actual iOS and Android runtime environments.

In Expo Go-style artifacts, avoid mounting custom native modules at app startup. Use React Native's built-in keyboard handling, and lazy-load RevenueCat only when its native bridge is available.

Never embed fallback RevenueCat SDK keys in the app or build profile. A missing, invalid, or mismatched key must disable purchases gracefully; a verified platform-specific key belongs in the native build environment.

**Why:** The app's native artifacts encountered runtime instability in the experimental navigation path and from startup dependencies that are not included in Expo Go, even though platform bundles compiled successfully. Stale RevenueCat keys also cause immediate invalid-key failures. The stable navigator and built-in keyboard handling preserve all tab behavior and tested reliably in the mobile-sized app flow.

**How to apply:** Treat navigation and root providers as runtime-sensitive areas. Validate Android and iOS bundle exports plus a fresh mobile-sized navigation smoke test whenever changing tab or native-module dependencies.