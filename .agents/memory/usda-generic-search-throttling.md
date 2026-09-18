---
name: USDA generic search request contract
description: Reliable request shape and throttling behavior for USDA FoodData Central generic searches.
---

Use USDA FoodData Central's JSON POST search format with an array of generic data types, and serialize requests with a short gap plus bounded retries.

**Why:** The GET search form with comma-joined or repeated generic data types produced intermittent HTTP 400 responses, especially when plate analysis launched several food searches together. The documented POST body remained stable in live checks.

**How to apply:** Any feature that resolves several generic food names should go through the shared USDA adapter instead of issuing parallel provider calls directly. Keep failures explicit and never substitute guessed nutrition.