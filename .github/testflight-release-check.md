# TestFlight release check

EAS and App Store Connect report different milestones:

1. **EAS submission complete** means EAS handed the IPA to Apple successfully.
2. **App Store Connect processing complete** means Apple accepted and processed that
   build. A processed `VALID` build is available to select in TestFlight.

The **Release iOS to TestFlight** workflow builds and submits the iOS binary, then
automatically starts the reusable **Verify TestFlight upload** workflow with the
exact EAS build and submission IDs returned by those commands. The verifier checks
both milestones and prints:

- app version
- build number
- EAS submission state
- App Store Connect `processingState`
- whether the build is available in TestFlight

## Configure the workflow

Add these GitHub Actions secrets in the repository settings:

- `EAS_TOKEN` — an EAS access token. `EXPO_TOKEN` is also accepted for repositories
  that already use that name. The workflow passes either secret to EAS CLI as
  `EXPO_TOKEN`, which is the variable EAS CLI reads in non-interactive runs.
- `ASC_API_KEY_ID` — App Store Connect API key ID
- `ASC_API_ISSUER_ID` — App Store Connect issuer ID
- `ASC_API_PRIVATE_KEY` — the complete contents of the App Store Connect `.p8`
  private key

The release workflow reconstructs and validates the private-key PEM in memory,
writes it only to an ignored temporary job file for EAS Submit, and removes that
file after submission. The verifier signs a short-lived API token in memory. The
workflows never echo the key, EAS JSON responses, or App Store Connect response
bodies.

The configured App Store Connect app is DiabEats (`6760898764`). If the app
changes, update the `--asc-app-id` value in
`.github/workflows/testflight-release-check.yml`.

## Run the release

1. Open the repository's **Actions** tab.
2. Select **Release iOS to TestFlight** and choose **Run workflow**.
3. The build ID is passed directly to EAS Submit, and both returned IDs are passed
   directly to the verifier. No ID copying is required.
4. The verifier polls App Store Connect for up to 15 minutes while the build is
   `PROCESSING`. A still-processing build can be checked again from the verifier
   workflow using the same IDs.

## Run the check manually

The verifier remains available for an iOS submission performed outside GitHub Actions:

1. Open the repository's **Actions** tab.
2. Select **Verify TestFlight upload** and choose **Run workflow**.
3. Enter the EAS submission ID and the EAS build ID for the same upload.
4. If the result remains `PROCESSING` after the polling window, run the workflow
   again later with the same IDs. The check succeeds only when App Store Connect
   reports `VALID`.

`PROCESSING`, `FAILED`, `INVALID`, and `NOT_FOUND` states are reported and cause
the workflow to fail, making it clear that an EAS upload is not the same as a
TestFlight-ready build. Before querying Apple, the check also requires EAS to
report the submission's linked `submittedBuild.id` and verifies that it matches
the entered build ID. A response without that relationship is rejected rather
than relying on two manually entered IDs.