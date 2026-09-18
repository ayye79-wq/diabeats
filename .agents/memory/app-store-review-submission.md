---
name: App Store review submission
description: Current App Store Connect flow for moving a valid uploaded iOS build into App Review.
---

An uploaded, valid TestFlight build is not automatically an App Store release. Create the matching App Store version, attach the exact valid build, confirm inherited metadata includes a non-empty “What’s New” field, then use the Review Submissions and Review Submission Items resources.

**Why:** App Store Connect no longer permits creating the legacy App Store Version Submission resource. It returns a forbidden error and directs review operations through the newer review-submission model. Newly created versions may inherit screenshots and review details while leaving “What’s New” blank, which blocks review eligibility.

**How to apply:** Before submitting, distinguish build upload from App Review. Verify the build’s prerelease marketing version and VALID state, avoid duplicate uploads, prepare the corresponding store version, fill missing required metadata, add it to a fresh non-complete review submission, and submit that review record.