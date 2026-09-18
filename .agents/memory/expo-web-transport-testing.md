---
name: Expo web transport testing
description: Fetch selection and deterministic network mocking for static Expo web exports.
---

For shared native/web request code, choose `globalThis.fetch` for browser requests at request time; retain Expo's fetch implementation for native requests.

**Why:** Static export evaluates modules without a browser. Choosing the transport during module initialization can permanently select the native-oriented shim in the hydrated web bundle, bypassing browser-level test routes and making end-to-end tests hit live services or rate limits.

**How to apply:** Keep the platform decision inside a small request wrapper invoked for each request. Browser end-to-end tests should mock session creation as well as feature endpoints so authentication rate limits cannot obscure the flow being tested.