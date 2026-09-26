export type AnalyticsValue = string | number | boolean;
export type AnalyticsProperties = Record<string, AnalyticsValue>;

export const NATIVE_ANALYTICS_SCHEMA = {
  scan_type_selected: ["scan_type"],
  plate_scan_started: ["source"],
  plate_scan_completed: ["impact_level", "nutrition_status", "item_count", "has_unknown_items"],
  plate_scan_failed: [],
  plate_portion_updated: ["unit"],
  plate_analysis_saved: ["nutrition_status", "item_count"],
  provider_match_confirmed: ["confidence"],
  smart_portion_swap_applied: ["nutrition_status"],
  paywall_viewed: ["trigger"],
  purchase_started: ["plan"],
  purchase_completed: ["plan"],
  purchase_cancelled: ["plan"],
  purchase_pending: ["plan"],
  purchase_failed: ["plan"],
  restore_started: [],
  restore_completed: [],
  restore_failed: ["outcome"],
} as const;

export type NativeAnalyticsEvent = keyof typeof NATIVE_ANALYTICS_SCHEMA;

const POSTHOG_TRANSPORT_PROPERTIES = [
  "token",
  "distinct_id",
  "$os",
  "$app_version",
  "$app_build",
] as const;

type NativeCaptureEvent = {
  uuid?: string;
  event: string;
  properties?: Record<string, unknown>;
  timestamp?: Date;
};

function isNativeAnalyticsEvent(event: string): event is NativeAnalyticsEvent {
  return Object.prototype.hasOwnProperty.call(NATIVE_ANALYTICS_SCHEMA, event);
}

export function safeNativeProperties(
  event: NativeAnalyticsEvent,
  properties?: AnalyticsProperties,
): AnalyticsProperties | undefined {
  if (!properties) return undefined;

  const allowed = new Set<string>(NATIVE_ANALYTICS_SCHEMA[event]);
  const safe = Object.fromEntries(
    Object.entries(properties).filter(
      ([key, value]) =>
        allowed.has(key) &&
        (typeof value === "string" || typeof value === "number" || typeof value === "boolean"),
    ),
  );
  return Object.keys(safe).length > 0 ? safe : undefined;
}

/**
 * Applies the privacy allowlist after PostHog has added its SDK properties.
 * Unknown events are dropped, as are person updates and all unreviewed metadata.
 */
export function finalizeNativeCapture(event: NativeCaptureEvent | null): NativeCaptureEvent | null {
  if (!event || !isNativeAnalyticsEvent(event.event)) return null;

  const callerProperties = safeNativeProperties(
    event.event,
    event.properties as AnalyticsProperties | undefined,
  );
  const transportProperties = Object.fromEntries(
    POSTHOG_TRANSPORT_PROPERTIES.flatMap((key) => {
      const value = event.properties?.[key];
      return typeof value === "string" || typeof value === "number" ? [[key, value]] : [];
    }),
  );

  return {
    uuid: event.uuid,
    event: event.event,
    properties: {
      ...transportProperties,
      ...callerProperties,
    },
    timestamp: event.timestamp,
  };
}