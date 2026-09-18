const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8")).expo;
const scanScreen = fs.readFileSync(path.join(root, "app", "(tabs)", "scan.tsx"), "utf8");
const bioTraceScreen = fs.readFileSync(path.join(root, "app", "(tabs)", "biotrace.tsx"), "utf8");
const plateScreen = fs.readFileSync(path.join(root, "app", "(tabs)", "plate.tsx"), "utf8");

const restrictedPermissions = [
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
];

test("Android only declares scoped camera access for meal scanning", () => {
  // Google Play reports code 8 as the highest code ever uploaded to a track.
  assert.ok(config.android.versionCode > 8);

  for (const permission of restrictedPermissions) {
    assert.ok(
      config.android.blockedPermissions.includes(permission),
      `${permission} must stay blocked`,
    );
    assert.ok(
      !config.android.permissions.includes(permission),
      `${permission} must not be declared as an Android app permission`,
    );
  }

  assert.ok(config.android.permissions.includes("android.permission.CAMERA"));
  assert.ok(!config.android.permissions.includes("android.permission.RECORD_AUDIO"));
});

test("menu, plate, and BioTrace photo selection rely on the system picker", () => {
  for (const screen of [scanScreen, plateScreen, bioTraceScreen]) {
    assert.match(screen, /ImagePicker\.launchImageLibraryAsync/);
    assert.doesNotMatch(screen, /requestMediaLibraryPermissionsAsync/);
    assert.doesNotMatch(screen, /MediaLibrary\.requestPermissionsAsync/);
    assert.match(screen, /ImagePicker\.requestCameraPermissionsAsync/);
  }
});