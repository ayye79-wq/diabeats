---
name: Android media permission releases
description: Release verification and Play Console cleanup required for Photo Picker policy compliance.
---

System-picker source code and Expo permission blocks are necessary but not sufficient evidence for Google Play media-policy compliance. Inspect the compiled base manifest inside the finished production AAB and confirm broad photo, video, legacy storage, and unnecessary audio permissions are absent.

**Why:** Native dependency manifest merging can add permissions after source configuration is resolved. Google Play also evaluates old bundles that remain active on production or testing tracks, so a compliant new build does not repair those tracks by itself.

**How to apply:** Before any Android Photo Picker policy resubmission, use a version code above every code ever uploaded, inspect the exact finished AAB with Android bundle tooling, record its full permission list, and enumerate every Play track that still needs an older noncompliant release replaced, deactivated, or excluded.