# DiabEats mobile device QA

Run this checklist on at least one real iPhone and one real Android device before release.

## Barcode scanning

- [ ] Allow camera permission from the BioTrace barcode scanner.
- [ ] Deny permission, confirm manual barcode entry remains usable, then enable permission from device settings.
- [ ] Scan EAN-13, EAN-8, UPC-A, UPC-E, and Code 128 package barcodes in normal and low light.
- [ ] Confirm a second scan does not fire while the first lookup is still loading.
- [ ] Confirm an invalid/unavailable barcode explains how to recover.
- [ ] Turn on airplane mode after a successful lookup; confirm the scan appears in **Saved → Scans** as “Waiting to sync.”
- [ ] Restore connectivity; reopen BioTrace or Saved and confirm the pending scan syncs.

## Accessibility

- [ ] Enable VoiceOver on iOS and TalkBack on Android.
- [ ] Navigate all five tabs and confirm tab names and selected states are announced.
- [ ] Confirm Scan choices, barcode fields, search buttons, saved-history tabs, and delete controls have clear spoken labels.
- [ ] Increase system text size and confirm no essential control is clipped or unreachable.

## Privacy and recovery

- [ ] Confirm no label photo is requested or stored; photo analysis remains visibly marked “Coming Soon.”
- [ ] Delete a local pending scan and confirm it disappears from Saved.
- [ ] Clear scan history and confirm the destructive confirmation appears.