import { Platform } from "react-native";

export type AnalyticsValue = string | number | boolean;
export type AnalyticsProperties = Record<string, AnalyticsValue>;

type UmamiClient = {
  track: (event: string, properties?: AnalyticsProperties) => void;
};

/**
 * Sends a custom event to Replit-hosted analytics on published web builds.
 * Replit injects Umami, so development and native builds intentionally no-op.
 */
export function trackWebEvent(event: string, properties?: AnalyticsProperties): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;

  try {
    (window as typeof window & { umami?: UmamiClient }).umami?.track(event, properties);
  } catch {
    // Analytics must never interrupt the user flow.
  }
}