---
name: GitHub Actions log access
description: Limits on diagnosing GitHub Actions failures through the connected GitHub account.
---

GitHub Actions metadata (run status, jobs, steps, annotations, and secret names) can be available through the connected account while downloadable and per-step logs remain access-restricted.

**Why:** The repository can be readable and writable through the connector without granting access to protected log output. Public job pages may also hide step stderr.

Workflow-file updates can be denied even when ordinary repository writes are allowed, because GitHub requires a separate workflow-write permission for `.github/workflows/*`.

**How to apply:** Use job metadata and annotations first. If the failed command's error text is not exposed, ask for the redacted stderr from the GitHub Actions UI; never request, display, or paste secret values. For a denied workflow update, use the GitHub web editor or an authorized workflow-write credential rather than retrying ordinary repository writes. Reauthorization may leave the connector healthy with the same `repo`-only scopes while the workflow Contents endpoint remains blocked; Git database and Actions endpoints can still confirm whether a workflow is present and active.