# Google Play Closed-Test Release

## Verified release

- **Android package:** `com.diabeats.android`
- **App version / code:** `1.3.4` / `6`
- **EAS build:** `c7efec89-8907-4b02-b27a-d5952c0e70e9`
- **EAS submission:** `a9ee81f9-868a-419e-b60d-2093cbecd039`
- **Track:** Closed / `alpha`
- **Release status:** Completed

Google Play Publisher API verification confirmed that version code `6` is the completed
release on the `alpha` track. The release owner confirmed that at least 12 testers are
opted in, beginning the required 14-day closed-testing period for production eligibility.

Google Play does not expose individual tester opt-in counts through the Publisher API.
Tester identities and release credentials are intentionally not recorded in this repository.

## Secure resubmission

`npm run submit:android:closed` resubmits only the verified EAS build above. It reads the
Google service-account JSON from the managed `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` secret,
writes it briefly to an ignored path with restrictive file permissions, and removes it
after EAS Submit exits. It does not rebuild the app.