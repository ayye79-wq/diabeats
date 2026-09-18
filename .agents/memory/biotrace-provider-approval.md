---
name: BioTrace provider approval
description: Approval and evidence guardrails for expanding BioTrace food data sources.
---

Do not add a BioTrace dependency or external provider until its license/terms, request limits, expected availability, returned data, and production/commercial-use permission are documented and it is confirmed free or explicitly approved. Keep human-readable PLUs, GS1/GTIN data, retailer-specific produce identifiers, and branded produce stickers as separate evidence types. Confidence must be supplied by provider/evidence, never invented as a BioTrace score; conflicting evidence requires confirmation.

**Why:** Produce stickers do not reliably encode standard PLUs, and silent provider selection or invented confidence could present the wrong food or nutrition as authoritative.

**How to apply:** Before proposing or implementing another product, produce, or generic-food source, report all required provider details and wait for approval when it is not already free and approved. Preserve evidence provenance through the resolver and downgrade conflicts to confirmation-required.