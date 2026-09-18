---
name: BioTrace data integrity
description: Trust boundaries for BioTrace label facts, ratings, and image privacy.
---

BioTrace must derive every persisted barcode-backed product snapshot and rating on the server from the public provider; client-supplied nutrition, ingredient, and rating payloads are never authoritative. The same product-provider request budget applies to scans and saves as to interactive lookups. Label photos may be transmitted only as bounded, authenticated, one-time vision inputs and must never be persisted by BioTrace. Ratings use a consistent nutrition basis, explicitly account for per-serving total carbohydrates, and never infer GMO risk from palm-oil tags.

**Why:** Public-label ratings must remain deterministic, explainable, and resistant to forged or mixed-basis client data. A low-sugar product can still be unsuitable because of total carbohydrates; unsupported ingredient inferences can misstate GMO status. Barcode-backed saves and histories can otherwise misrepresent a product or allow provider request abuse.

**How to apply:** When adding new food persistence, comparison, or import paths, accept a barcode or another independently verified source identifier, reconstruct the normalized product and rating server-side, and apply the product lookup limiter before provider work. Preserve unit consistency in nutrition rules, consider carbohydrate amount separately from sugars, and only report GMO claims supported by explicit provider labels. A user-approved label-photo flow may send a size-bounded image through an authenticated vision request, but must never put the image or its unverified result into saved foods, scan history, or verified-provider records.