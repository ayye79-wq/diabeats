# Native analytics privacy and release checklist

## Provider decision

DiabEats uses the PostHog React Native SDK for manually selected iOS and Android product events. PostHog was selected because its Expo-compatible SDK can be configured for explicit events only and can disable person profiles, GeoIP enrichment, lifecycle events, touch/screen autocapture, error capture, push capture, and session replay.

The SDK uses memory-only persistence. A final `before_send` filter drops unknown events, person updates, session IDs, screen dimensions, device model, SDK metadata, and every unreviewed property after PostHog enrichment. It retains only the public project token, an anonymous process-scoped `distinct_id`, OS name, app version/build, and the event-specific reviewed fields below. DiabEats never identifies that anonymous ID or associates it with an account, RevenueCat, device, barcode, restaurant, meal, food, or health profile. The anonymous ID is recreated when the app process restarts, so the data supports aggregate funnel analysis rather than cross-session user tracking.

## Collection gate

Native analytics is off unless a build has both:

- `EXPO_PUBLIC_NATIVE_ANALYTICS_ENABLED=true`
- `EXPO_PUBLIC_POSTHOG_API_KEY` set to the PostHog project key

`EXPO_PUBLIC_POSTHOG_HOST` is optional and defaults to the PostHog US ingestion host. Use the EU host when the approved PostHog project is EU-hosted.

Do not enable these values in production until the disclosure and consent review below is complete. TestFlight and Android test builds may use a separate test project to verify ingestion without mixing test and production data.

The dedicated EAS profiles are `testflight-analytics` for an iOS store build and `android-analytics-test` for an internal Android APK. Both use the EAS `preview` environment and explicitly enable native analytics; the normal `production` profile remains disabled.

## Reviewed event data

Only event names and properties in `lib/analyticsSchema.ts` can leave a native app. The final-payload runtime allowlist runs after PostHog enrichment and drops every other event and property.

Allowed data is limited to:

- feature choices such as scan type, subscription plan, or paywall trigger
- categorical outcomes such as nutrition completeness, estimated impact band, confidence band, and restore outcome
- booleans and counts such as item count or whether unknown items were present
- required transport metadata: public project token and a process-scoped anonymous ID
- release diagnostics: OS name and app version/build

Never add photos, image URIs or base64, food/meal/restaurant names, barcodes, product identifiers, health-profile values, location, user/account/subscriber IDs, error messages, search text, AI prompts, or any free-form content. Any new event or property requires privacy review plus an allowlist and test update.

## TestFlight and Android test-build verification

For each platform, build with the collection gate enabled against the test PostHog project:

1. Build with `eas build --platform ios --profile testflight-analytics` or `eas build --platform android --profile android-analytics-test`, then install the exact TestFlight or Android test build.
2. Select each Scan entry, complete one plate analysis, and open the paywall. Use sandbox purchase/restore flows if available.
3. In PostHog Live Events, filter to the build's platform and confirm the reviewed event names arrive.
4. Open several event payloads and confirm there are no photos, image paths, food names, meal names, restaurant names, barcodes, health values, IDs, error text, prompts, or free-form fields.
5. Confirm touch autocapture, screen events, lifecycle events, session replay, person profiles, and error events remain absent.
6. Record the build numbers, platform, UTC verification time, reviewer, and result in the release notes. Disable the collection gate if any unexpected field or automatic event appears.

The automated test exercises the final PostHog payload boundary, including representative SDK-added session, screen, device, and library metadata. Device verification is still required because only signed store builds can prove provider delivery and native SDK configuration.

## Consent and disclosures before production

Before enabling production collection:

- Have the privacy owner or counsel decide whether explicit opt-in consent is required in each launch region, especially for EU/UK users and because DiabEats is health-adjacent. If consent is required, keep the build gate off until an in-app opt-in and withdrawal control exists.
- Update the privacy policy to name PostHog, its processing purpose, data categories, retention period, hosting region, and opt-out/withdrawal method. The current generic “usage events” wording is not enough on its own.
- Complete a data-processing agreement and document the approved PostHog project region, access controls, retention, and deletion policy.
- Update Apple App Privacy answers and Google Play Data Safety answers to match the exact SDK behavior and counsel's classification of anonymous identifiers and product-interaction data.
- Confirm PostHog project settings do not enable session replay, autocapture, person profiles, or longer retention than the published policy.
- Re-run both signed-build verification checklists after every SDK or privacy-configuration change.