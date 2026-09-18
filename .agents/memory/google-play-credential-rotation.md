---
name: Google Play credential handling
description: Keep Google Play service-account credentials out of source control while using EAS Submit.
---

Never commit a Google Play service-account JSON key, add it to attached assets, or reference a tracked key from the EAS submit profile. Store the JSON in managed secret storage and materialize it only into a Git-ignored, short-lived file when EAS Submit runs.

**Why:** Anyone with repository access can use an exposed service-account key within its granted Google Play permissions. Removing it from the latest commit does not remove it from older Git history.

**How to apply:** Keep the submit profile pointed to an ignored temporary path. Before a submission, validate the managed secret, write it with restrictive permissions, submit an existing build, and remove the temporary file immediately afterward. Revoke any key that was committed and purge it from Git history.