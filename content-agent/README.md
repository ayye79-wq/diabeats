# DiabEats Content Agent

The agent creates two medically cautious TikTok content packages per day. It is approval-first: scheduled runs generate drafts, but never publish them.

## GitHub setup

1. Add the repository secret `OPENAI_API_KEY` (the workflow also accepts
   `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`).
2. Run **Actions â†’ DiabEats Content Agent â†’ Run workflow** once.
3. Download the generated JSON artifact and review it.

If generation fails, the workflow remains failed but writes a redacted,
actionable explanation to the GitHub job summary. The summary never includes
the provider response or credential values. A failed generation does not run
artifact upload or save an incomplete rotation state, so the next retry can
use the last successful state.

## TikTok connection

Register a TikTok Sandbox app with the Content Posting API, set its redirect URI to `https://diabeatsapp.com/api/tiktok/callback`, and request only the `video.upload` scope. Configure `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` as deployment secrets plus `TIKTOK_REDIRECT_URI` with that exact callback. Then use **Connect TikTok** in `/admin/content`; tokens stay encrypted on the server and approved videos can only be sent to the TikTok Inbox. This deliberately avoids unattended public posting.

TikTok requires explicit creator consent and an audited client for unrestricted public Direct Post. See the official Content Posting API documentation before enabling automatic publication.

## Commands

- `npm run content:generate`
- `npm run content:approve -- <content-id>`
- `npm run content:publish -- <content-id>`

Generated media, queue state, and publishing records are excluded from Git.

Generated drafts use the approved DiabEats Social V4 presentation by default. The
generator selects a medically cautious meal and nutrition example from a curated
rotation, records its stable package ID in `state.json`, and excludes recent
packages from later scheduled runs. Older topic-only state files are still
accepted. Approval remains required before any TikTok Inbox upload.
