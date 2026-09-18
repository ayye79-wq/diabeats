---
name: BioTrace profile personalization
description: Privacy and interpretation boundaries for profile-aware BioTrace ratings.
---

BioTrace personalization may reweight only verified per-serving nutrition facts using explicit saved goals and diabetes-profile settings. If the available facts do not change the score, explain that the profile was reviewed; if a serving basis is unavailable, say personalization could not be applied. Insulin use must not create a food threshold or score adjustment.

**Why:** The same product facts can deserve different emphasis for different saved goals, but profile-derived factors can reveal health information. Persisting those factors in scan or saved-food snapshots creates unnecessary sensitive data, and treating insulin use as a nutrient rule would imply unsupported medical guidance.

**How to apply:** Persist profile-neutral product/rating snapshots only. Recompute profile-aware ratings transiently for authenticated responses and active UI state, including alternatives and Assistant context. Keep verified label values unchanged, and guard asynchronous results so an older profile response cannot replace the current interpretation.