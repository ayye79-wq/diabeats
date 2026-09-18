---
name: Post-merge dependency recovery
description: Package firewall constraint and the stable post-merge dependency-install approach.
---

Keep the post-merge hook configured to run `npm ci`, retain the project-level safe `shell-quote` override, and pin Expo SDK 57's Reanimated/Worklets peer pair together.

**Why:** The React Native developer-tool dependency tree previously resolved a blocked `shell-quote` release, causing deterministic installs to fail and leaving the frontend dependency tree incomplete.

**Why:** Loose ranges allowed a clean install to select Reanimated 4.6.0 while Worklets remained on 0.10.x, producing an `ERESOLVE` failure even though the checked-in lockfile used the compatible Reanimated 4.5.1 and Worklets 0.10.1 pair.

**How to apply:** When a future dependency update changes this tree, preserve a current safe `shell-quote` resolution or update the parent dependency before removing the override. Keep compatible Reanimated and Worklets versions explicitly aligned, and always rerun the configured post-merge setup after changing them.

The post-merge hook must avoid an unconditional clean install when the installed npm hidden lockfile exactly matches the checked-in lockfile.

**Why:** A clean Expo dependency install can take more than ten minutes in this environment, exceeding the merge setup window even after a normal timeout increase.

**How to apply:** Reuse an exact matching `node_modules/.package-lock.json` tree; run non-interactive `npm ci` only when dependencies are missing or the package entries differ. Keep a generous timeout for the first install in a fresh workspace, then rerun post-merge setup after changing the hook.