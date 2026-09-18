# Android Photo Picker Release Handoff

## Build

- App: DiabEats 1.3.4
- Package: `com.diabeats.android`
- Android version code: `9`
- Target SDK: `36`
- EAS build ID: `c4cbd62f-a43e-4cae-9099-1beed94e9b26`
- Status: finished
- Artifact: `https://expo.dev/artifacts/eas/9IlGmF0G0V18igmxC_KFPFrvH7u2KSNxtSc_j3TmXm8.aab`
- SHA-256: `98c83975177fe74b332e6fb953a44251a82be4480b377b5ebb2aef89e5cbc913`
- Submission status: submitted to Google Play; code 9 is currently in review on Production and Alpha/closed testing
- EAS submission ID: `264c7732-6ab5-43fc-8db4-ca63751eca4c`
- Submission details: `https://expo.dev/accounts/fantoli/projects/diabeats/submissions/264c7732-6ab5-43fc-8db4-ca63751eca4c`

The finished production AAB was downloaded and inspected with Google bundletool 1.18.1. This check used the compiled base manifest inside the finished artifact, not only the Expo source configuration or a generated prebuild manifest.

## Policy permission result

The finished AAB does not contain:

- `android.permission.READ_MEDIA_IMAGES`
- `android.permission.READ_MEDIA_VIDEO`
- `android.permission.READ_MEDIA_VISUAL_USER_SELECTED`
- `android.permission.READ_EXTERNAL_STORAGE`
- `android.permission.WRITE_EXTERNAL_STORAGE`
- `android.permission.RECORD_AUDIO`

Menu and BioTrace label photo selection use Expo ImagePicker's system picker without a media-library permission request. Camera capture continues to request camera permission only.

## Complete AAB permission list

- `android.permission.ACCESS_COARSE_LOCATION`
- `android.permission.ACCESS_FINE_LOCATION`
- `android.permission.ACCESS_NETWORK_STATE`
- `android.permission.CAMERA`
- `android.permission.INTERNET`
- `android.permission.POST_NOTIFICATIONS`
- `android.permission.READ_APP_BADGE`
- `android.permission.RECEIVE_BOOT_COMPLETED`
- `android.permission.SYSTEM_ALERT_WINDOW`
- `android.permission.VIBRATE`
- `android.permission.WAKE_LOCK`
- `com.anddoes.launcher.permission.UPDATE_COUNT`
- `com.android.vending.BILLING`
- `com.diabeats.android.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`
- `com.google.android.c2dm.permission.RECEIVE`
- `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE`
- `com.htc.launcher.permission.READ_SETTINGS`
- `com.htc.launcher.permission.UPDATE_SHORTCUT`
- `com.huawei.android.launcher.permission.CHANGE_BADGE`
- `com.huawei.android.launcher.permission.READ_SETTINGS`
- `com.huawei.android.launcher.permission.WRITE_SETTINGS`
- `com.majeur.launcher.permission.UPDATE_BADGE`
- `com.oppo.launcher.permission.READ_SETTINGS`
- `com.oppo.launcher.permission.WRITE_SETTINGS`
- `com.sec.android.provider.badge.permission.READ`
- `com.sec.android.provider.badge.permission.WRITE`
- `com.sonyericsson.home.permission.BROADCAST_BADGE`
- `com.sonymobile.home.permission.PROVIDER_INSERT_BADGE`
- `me.everything.badger.permission.BADGE_COUNT_READ`
- `me.everything.badger.permission.BADGE_COUNT_WRITE`

## Google Play track cleanup

The live Google Play Publisher API check after the code 9 submission reported:

- Production: version code `9`, lifecycle state `IN_REVIEW`; code `2` is no longer the active release
- Beta: no active release
- Internal: version code `9`, lifecycle state `PUBLISHED`; code `2` is no longer the active release
- Android testers: version code `9` is `NOT_SENT_FOR_REVIEW`, while version code `2` remains `PUBLISHED`
- Alpha / closed testing: version code `9`, lifecycle state `IN_REVIEW`

The remaining action is to send the Android-testers code `9` release for review from Publishing overview so it can replace code `2`. The version code remains in historical records even after it is no longer active.