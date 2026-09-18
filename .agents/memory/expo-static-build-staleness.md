---
name: Expo static build staleness
description: The web preview serves a prebuilt static export, not a hot-reloaded dev server — know when a rebuild is actually needed.
---

The web preview in this project is served from a prebuilt static Expo export
(`static-build/`, served by Express), not hot-reloaded from the Metro dev
server. Changes to `app/`/`components/` (frontend, client-rendered) files do
not appear in the preview until `npm run expo:static:build` is re-run and the
backend workflow is restarted.

**Why:** avoids re-diagnosing "my fix isn't showing up" as an app bug when it
is actually a stale bundle — this caused a full false-negative e2e test cycle
before being understood.

**How to apply:** rebuild + restart only when you changed frontend/component
code that runs in the browser. Purely server-side changes (routes, services,
shared logic consumed only by the Node backend) take effect immediately on a
backend workflow restart — no static rebuild needed. Don't rebuild reflexively
for every change; check whether the change actually touches client-rendered
code first.
