---
name: Post-merge dependency recovery
description: Package firewall constraint and the stable post-merge dependency-install approach.
---

Keep the post-merge hook configured to run `npm ci`, and retain the project-level safe `shell-quote` override.

**Why:** The React Native developer-tool dependency tree previously resolved a blocked `shell-quote` release, causing deterministic installs to fail and leaving the frontend dependency tree incomplete.

**How to apply:** When a future dependency update changes this tree, preserve a current safe `shell-quote` resolution or update the parent dependency before removing the override. Always rerun the configured post-merge setup after changing it.