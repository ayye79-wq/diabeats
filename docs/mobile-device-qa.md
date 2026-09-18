# DiabEats mobile device QA

Run this checklist on at least one real iPhone and one real Android device before release.

## Meal photo scanning — verified Android release

**Release tested:** DiabEats 1.3.4 (Android versionCode 7) on a physical Android device.

- [x] Choosing a meal photo opened Android's system photo picker without a broad photo or video-library permission prompt.
- [x] Taking a meal photo showed the standard Camera permission dialog only; no broad photo or video-library permission was requested.
- [x] Selected and captured photos both returned to the app, displayed a preview, and completed analysis without errors or crashes.

## Barcode scanning

- [ ] Allow camera permission from the BioTrace barcode scanner.
- [ ] Deny permission, confirm manual barcode entry remains usable, then enable permission from device settings.
- [ ] Scan EAN-13, EAN-8, UPC-A, UPC-E, and Code 128 package barcodes in normal and low light.
- [ ] Confirm a second scan does not fire while the first lookup is still loading.
- [ ] Confirm an invalid/unavailable barcode explains how to recover.
- [ ] Turn on airplane mode after a successful lookup; confirm the scan appears in **Saved → Scans** as “Waiting to sync.”
- [ ] Restore connectivity; reopen BioTrace or Saved and confirm the pending scan syncs.
- [ ] Repeat the same product scan within 30 seconds; confirm only one history entry is shown locally and remotely.
- [ ] Confirm an identical scan after 30 seconds can create a new history entry.

## Accessibility

- [ ] Enable VoiceOver on iOS and TalkBack on Android.
- [ ] Navigate all five tabs and confirm tab names and selected states are announced.
- [ ] Confirm Scan choices, barcode fields, search buttons, saved-history tabs, and delete controls have clear spoken labels.
- [ ] Increase system text size and confirm no essential control is clipped or unreachable.

## Privacy and recovery

- [ ] Confirm no label photo is requested or stored; photo analysis remains visibly marked “Coming Soon.”
- [ ] Delete a local pending scan and confirm it disappears from Saved.
- [ ] Clear scan history and confirm the destructive confirmation appears.