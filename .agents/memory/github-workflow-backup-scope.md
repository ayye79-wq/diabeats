---
name: GitHub workflow backup scope
description: Authorization constraint for backup branches whose tree changes GitHub Actions workflows
---

Backup branches that differ from the destination repository under `.github/workflows/` require GitHub authorization that can write workflow files. General repository write access may upload blobs, trees, and commits but still reject branch-ref creation.

**Why:** GitHub applies a separate workflow permission when a new branch exposes changed Actions workflow files. Repository-level write access alone is not sufficient.

**How to apply:** Prefer a GitHub App or OAuth grant with workflow write permission for exact backups. If that permission is unavailable, keep the repository’s existing workflow subtree unchanged, preserve workspace-only workflows locally, and report them as excluded resources.