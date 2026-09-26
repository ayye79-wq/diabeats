import { Platform } from "react-native";

import {
  finalizeNativeCapture,
  safeNativeProperties,
  type AnalyticsProperties,
  type NativeAnalyticsEvent,
} from "@/lib/analyticsSchema";
import { trackWebEvent } from "@/lib/webAnalytics";

type PostHogClient = {
  capture: (event: string, properties?: AnalyticsProperties) => void;
};

let nativeClient: PostHogClient | null | undefined;

function getNativeClient(): PostHogClient | null {
  if (nativeClient !== undefined) return nativeClient;

  const enabled = process.env.EXPO_PUBLIC_NATIVE_ANALYTICS_ENABLED === "true";
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim();
  if (Platform.OS === "web" || !enabled || !apiKey) {
    nativeClient = null;
    return nativeClient;
  }

  try {
    const { PostHog } = require("posthog-react-native") as typeof import("posthog-react-native");
    nativeClient = new PostHog(apiKey, {
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com",
      persistence: "memory",
      personProfiles: "never",
      disableGeoip: true,
      captureAppLifecycleEvents: false,
      capturePushNotificationSubscriptions: false,
      capturePushNotificationOpened: false,
      enableSessionReplay: false,
      setDefaultPersonProperties: false,
      rageClickConfig: { enabled: false },
      errorTracking: { autocapture: false },
      before_send: (event) => finalizeNativeCapture(event) as typeof event,
    });
  } catch {
    nativeClient = null;
  }

  return nativeClient;
}

/**
 * Tracks the same reviewed, non-PII product events on web and native.
 * Native collection is build-time opt-in and rejects every unreviewed property.
 */
export function trackAnalyticsEvent(
  event: NativeAnalyticsEvent,
  properties?: AnalyticsProperties,
): void {
  const safeProperties = safeNativeProperties(event, properties);
  if (Platform.OS === "web") {
    trackWebEvent(event, safeProperties);
    return;
  }

  try {
    getNativeClient()?.capture(event, safeProperties);
  } catch {
    // Analytics must never interrupt the user flow.
  }
}