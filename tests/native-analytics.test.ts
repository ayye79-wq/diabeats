import assert from "node:assert/strict";
import test from "node:test";

import { finalizeNativeCapture, safeNativeProperties } from "../lib/analyticsSchema";

test("native analytics keeps only reviewed categorical properties", () => {
  assert.deepEqual(
    safeNativeProperties("plate_scan_completed", {
      impact_level: "moderate",
      nutrition_status: "partial",
      item_count: 3,
      has_unknown_items: true,
      photo: "base64-data",
      food_name: "private meal",
      barcode: "0123456789",
      free_form: "user-entered content",
    }),
    {
      impact_level: "moderate",
      nutrition_status: "partial",
      item_count: 3,
      has_unknown_items: true,
    },
  );
});

test("native analytics drops all properties from property-free events", () => {
  assert.equal(
    safeNativeProperties("plate_scan_failed", {
      error: "may contain provider or user content",
    }),
    undefined,
  );
});

test("final PostHog payload keeps only required transport metadata and reviewed fields", () => {
  const event = finalizeNativeCapture({
    uuid: "018f8d5e-1111-7222-8333-123456789abc",
    event: "plate_scan_completed",
    properties: {
      token: "public-project-token",
      distinct_id: "ephemeral-process-id",
      $os: "iOS",
      $app_version: "1.3.5",
      $app_build: "49",
      $session_id: "removed-session-id",
      $screen_width: 390,
      $screen_height: 844,
      $device_model: "removed-device-model",
      $lib: "posthog-react-native",
      $lib_version: "4.74.2",
      impact_level: "moderate",
      nutrition_status: "partial",
      item_count: 3,
      has_unknown_items: true,
      photo: "removed-photo",
      food_name: "removed-food-name",
      health_profile: "removed-health-value",
    },
    timestamp: new Date("2026-09-18T17:00:00.000Z"),
  });

  assert.deepEqual(event, {
    uuid: "018f8d5e-1111-7222-8333-123456789abc",
    event: "plate_scan_completed",
    properties: {
      token: "public-project-token",
      distinct_id: "ephemeral-process-id",
      $os: "iOS",
      $app_version: "1.3.5",
      $app_build: "49",
      impact_level: "moderate",
      nutrition_status: "partial",
      item_count: 3,
      has_unknown_items: true,
    },
    timestamp: new Date("2026-09-18T17:00:00.000Z"),
  });
});

test("final PostHog payload drops SDK-generated or unreviewed events", () => {
  assert.equal(
    finalizeNativeCapture({
      event: "$screen",
      properties: {
        token: "public-project-token",
        distinct_id: "ephemeral-process-id",
      },
    }),
    null,
  );
});