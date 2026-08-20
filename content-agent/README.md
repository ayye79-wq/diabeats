# DiabEats Content Agent

The agent creates two medically cautious TikTok content packages per day. It is approval-first: scheduled runs generate drafts, but never publish them.

## GitHub setup

1. Add the repository secret `OPENAI_API_KEY`.
2. Run **Actions â†’ DiabEats Content Agent â†’ Run workflow** once.
3. Download the generated JSON artifact and review it.

## TikTok connection

Register an app in TikTok for Developers, add the Content Posting API, request the `video.upload` scope, and authorize the DiabEats account. Set `TIKTOK_ACCESS_TOKEN` only in the deployment secret managerâ€”never in Git. The current publisher sends an approved MP4 to the TikTok inbox, where the owner reviews and completes the post. This deliberately avoids unattended public posting.

TikTok requires explicit creator consent and an audited client for unrestricted public Direct Post. See the official Content Posting API documentation before enabling automatic publication.

## Commands

- `npm run content:generate`
- `npm run content:approve -- <content-id>`
- `npm run content:publish -- <content-id>`

Generated media, queue state, and publishing records are excluded from Git.
