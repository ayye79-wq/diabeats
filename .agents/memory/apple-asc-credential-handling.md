---
name: Apple App Store Connect credential handling
description: How to submit DiabEats iOS builds to App Store Connect via EAS Submit non-interactively.
---

EAS Submit for iOS needs an App Store Connect API key (Key ID, Issuer ID, and a `.p8` private key) to run non-interactively; `eas.json`'s `submit.production.ios` only carries the non-secret `ascAppId` and `appleTeamId`. There is no env-var path for the key content — EAS only reads it from a file via `ascApiKeyPath`.

**Why:** Without the key, `eas submit --non-interactive` for iOS has no way to authenticate, and interactive Apple ID login isn't available in this environment.

**How to apply:**
1. Request `ASC_API_KEY_ID`, `ASC_API_ISSUER_ID`, `ASC_API_PRIVATE_KEY` as managed secrets (names match `scripts/check-testflight.js` and `.github/testflight-release-check.md`).
2. The private key often arrives with its internal newlines flattened to spaces (observed via `requestSecrets` for multiline input). Reconstruct proper PEM by slicing the content between the literal `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` markers, stripping all whitespace from the body, and rewrapping at 64 chars before writing the file. Verify with `crypto.createPrivateKey()` before using it.
3. Write the key to a git-ignored path (`.eas/*.p8` is in `.gitignore`), inject the real `ascApiKeyPath` / `ascApiKeyId` / `ascApiKeyIssuerId` into `eas.json` only in the working tree (never commit), run the build and submit, then `git checkout -- eas.json` and delete the temp `.p8` file immediately after.
4. EAS submission command capabilities vary by CLI generation: the current family supports structured list/view queries, but the initial submit command still lacks JSON output. Never infer identity from the newest submission or build ID alone because one build can have multiple submissions; bind follow-up checks to the specific invocation's returned submission URL/ID. Recheck CLI help after upgrades.
5. Backgrounding a long `eas build`/`eas submit` command with `nohup ... &` inside one shell call does not reliably survive — the process can die silently with no error once the tool call returns. Run these in the foreground (they return quickly with `--no-wait` for build, or block until done for submit) rather than detaching them.
