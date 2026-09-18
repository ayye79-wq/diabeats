---
name: BioTrace reference-gap telemetry
description: Coverage and privacy rule for tracking ingredients the reference dictionary cannot explain.
---

Every BioTrace result that exposes ingredient analysis must contribute its unclassified ingredients to aggregate reference-gap telemetry, including direct lookups, QR and label scans, generic search matches, source products, and displayed alternatives. Store only normalized ingredient names, canonical taxonomy IDs when available, and counts.

**Why:** Limiting collection to the primary barcode path silently excludes independent search and alternatives flows, biasing the reference priorities. Scan-level context is unnecessary and would weaken the privacy boundary.

**How to apply:** When a new BioTrace route or result type returns ingredient analysis, include the same bounded, de-duplicated aggregate write and cover the route in integration tests. Never add session, barcode, product, image, raw-list, or timestamp dimensions to this telemetry.