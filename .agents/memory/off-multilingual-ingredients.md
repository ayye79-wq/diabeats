---
name: Open Food Facts multilingual ingredients
description: Trustworthy multilingual ingredient classification for provider products and OCR label photos.
---

Open Food Facts products are frequently labeled in the manufacturer's local
language (French, German, etc.), not English. A dictionary that only matches
against raw `ingredients_text` will silently misclassify or fail on these
products — including popular, real-world items, not just edge cases. The
French decimal comma ("7,4%") can also corrupt a naive comma-based
ingredient-list splitter.

**Fix:** OFF's product API (and `cgi/search.pl`) can return a structured
`ingredients` field: a language-agnostic taxonomy tree with canonical English
ids (e.g. `en:sugar`, `en:palm-oil`, `en:e322` nested with `en:soya-lecithin`)
alongside the original localized label text. Request this field explicitly —
it is not included by default — flatten nested sub-ingredients, and classify
against the canonical id while still displaying the localized label text to
the user. This is still sourced provider data, not invented.

**Why:** matching against the taxonomy id instead of raw text makes ingredient
classification language-agnostic without needing a translation step or a
dictionary entry per language. Falls back to raw-text parsing only when no
taxonomy is available (e.g. OCR'd label photos have no taxonomy).

**How to apply:** any BioTrace-style feature that classifies or explains
OFF ingredient data should request and prefer the structured `ingredients`
field over `ingredients_text` wherever the calling code fetches product data
(barcode lookup, name-search-by-barcode, and alternatives/candidate search all
need this field added to their own OFF `fields` request separately — it is
not shared automatically between them).

OCR label photos are a different trust boundary: never ask the vision model to
choose canonical ingredient IDs, because a visible word paired with the wrong
ID can produce a confident but false explanation. Match exact OCR terms through
a reviewed multilingual alias list instead, preserve unknown terms as
unclassified, and keep the OCR ingredient field read-only during confirmation.

**Why:** The image model is evidence for visible text, not authoritative
ingredient meaning. User edits must not expand the ingredient evidence beyond
what OCR returned.

**How to apply:** Use provider taxonomy only for provider-backed products. For
photo labels, preserve the original language, handle localized decimal commas,
classify deterministically, and require another photo when the ingredient
transcription is wrong.
