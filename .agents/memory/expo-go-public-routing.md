---
name: Expo Go public routing
description: The public Replit endpoint must bridge Expo Go to the Metro dev server in this dual-server project.
---

For physical Expo Go development, preserve the public packager URL and proxy native manifest, Metro bundle, and Metro asset requests through the backend to Metro. A static Expo web export cannot supply the iOS or Android development manifest.

**Why:** The default public Replit endpoint resolves to the backend, while Metro listens separately. Sending Expo Go to the backend without a bridge returns a missing-platform-manifest response. Even when the manifest and bundle work, native fonts and icons resolve through Metro asset URLs that carry an `unstable_path` query; serving those as ordinary web assets returns 404 and can terminate the simulator after its bundle reaches 100%. The proxy must preserve the public Host header when forwarding to Metro—otherwise Metro writes loopback URLs into the bundle’s source directives and response metadata. Letting Expo choose its default LAN address instead advertises an inaccessible container IP; the external tunnel service can also be unavailable.

**How to apply:** When changing Expo startup, backend routing, or workflow ports, test the public endpoint with an `expo-platform: ios` header and fetch the returned launch asset. Confirm its response metadata and final source directives use the public domain rather than localhost or a private container address, then fetch at least one real Metro font or icon asset URL and confirm it returns its binary content rather than a 404. Scan the newly generated QR code rather than reusing an old one.

For Replit's embedded mobile preview, Metro must bind beyond localhost and the frontend workflow must wait for Metro's port. Otherwise, the preview shell can stay on “Your app is starting…” even when the app bundle is otherwise available.