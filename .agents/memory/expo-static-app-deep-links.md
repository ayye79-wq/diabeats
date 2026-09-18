---
name: Expo static app deep links
description: Browser preview behavior for nested paths under the static Expo app mount, and why UI code edits don't show up until rebuilt.
---

The static Expo web app is mounted below `/app` in Preview. Its exported bundle must bake in that base path, and the server must expose static assets at the same mount point, or a hard-loaded nested URL is interpreted as an unmatched route by the client router.

**Why:** Serving the app shell alone does not tell the browser client router to remove `/app` before it matches file-based routes. The base path must stay web-build-specific so native routes retain their existing behavior.

**How to apply:** Treat this as a web deep-link delivery concern, not a native routing regression. Build the static app with its web mount path, test fresh-browser direct navigation and reloads, and explicitly allow intended public share routes through any web onboarding gate before advertising them.

## The web preview does not hot-reload from source

The root path `/` (and `/app`) served by the backend (`Start Backend`, port 5000 — the default Screenshot/testing-subagent target) is a **pre-built static export** (`static-build/`), not the live Metro dev server. `Start Frontend` runs `expo start` (Metro on 8081) for native/Expo Go, but editing a `.tsx` file and restarting `Start Frontend` does **not** change what the web preview shows.

**Why:** `scripts/build.js` (`npm run expo:static:build`) runs `npx expo export --platform web --output-dir static-build` once, and `server/index.ts` serves that directory via `express.static`. It only reflects whatever was true at the last export.

**How to apply:** After any web-visible UI change, run `npm run expo:static:build` (takes ~1-2 min) before taking a Screenshot or dispatching a testing subagent against path `/` — otherwise you will see stale UI and may wrongly conclude the edit didn't apply. No backend restart is needed afterward; the new static files are picked up immediately since they're served straight from disk.
