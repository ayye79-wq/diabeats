---
name: DiabEats promotional video template
description: Keeps promotional-video presentation modular and separate from the approval-first publishing workflow.
---

Promotional video visuals live in a dedicated presentation template and may use fixed, approved end-card copy. Visual revisions must not alter content approval, OAuth, TikTok upload, duplicate prevention, or scheduling behavior.

**Why:** The publishing workflow is safety-sensitive and already verified, while visual polish needs fast iteration without reopening that risk surface.

**How to apply:** Change the template module, image assets, renderer composition, and preview-only renderer when revising style. Preserve draft validation and workflow systems; use a fresh `draft` preview for review, never replace or approve an existing approved package.

The dashboard preview should prefer a VP9/Opus WebM sidecar when available, while TikTok upload must continue using the H.264/AAC MP4.

**Why:** The Replit browser environment does not decode the MP4 codecs reliably, but TikTok requires the MP4 delivery format.

**How to apply:** Generate both formats for new drafts, keep the WebM sidecar private behind the same admin authorization, and retain the MP4 as the publishing source.

The approved V4 identity uses the DiabEats fork-and-leaf mark as a transparent overlay in the header and final CTA card.

**Why:** The user confirmed this placement keeps the mark visible without obscuring meal imagery or safety copy.

**How to apply:** Keep the logo treatment presentation-only, use it with the existing wordmark, and preserve the approval-first workflow unchanged.