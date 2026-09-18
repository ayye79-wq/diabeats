import { z } from "zod";

export const REVENUECAT_PREMIUM_ENTITLEMENT = "premium";

export const revenueCatWebhookEventSchema = z.object({
  id: z.string().trim().min(1).max(255),
  app_user_id: z.string().trim().regex(/^diabeats_[0-9a-f-]+$/i).max(255),
  type: z.string().trim().min(1).max(80),
  entitlement_ids: z.array(z.string().trim().min(1).max(255)).max(20).optional().default([]),
  event_timestamp_ms: z.number().int().positive(),
  expiration_at_ms: z.number().nullable().optional(),
});

export type RevenueCatWebhookEvent = {
  id: string;
  app_user_id: string;
  type: string;
  entitlement_ids?: string[];
  event_timestamp_ms: number;
  expiration_at_ms?: number | null;
};

const PREMIUM_ACTIVATION_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
]);

const PREMIUM_DEACTIVATION_EVENTS = new Set([
  "EXPIRATION",
  "SUBSCRIPTION_PAUSED",
]);

export function premiumStateFromRevenueCatEvent(
  event: RevenueCatWebhookEvent,
  now = Date.now(),
): boolean | null {
  if (!event.entitlement_ids?.includes(REVENUECAT_PREMIUM_ENTITLEMENT)) return null;

  const eventType = event.type.toUpperCase();
  if (PREMIUM_ACTIVATION_EVENTS.has(eventType)) return true;
  if (PREMIUM_DEACTIVATION_EVENTS.has(eventType)) return false;

  if (eventType === "CANCELLATION" || eventType === "BILLING_ISSUE") {
    return (event.expiration_at_ms ?? 0) > now;
  }

  return null;
}

export function hasActiveRevenueCatEntitlement(customerInfo: unknown): boolean {
  const active = (
    customerInfo as {
      entitlements?: {
        active?: Record<string, unknown>;
      };
    }
  )?.entitlements?.active;

  return Boolean(active?.[REVENUECAT_PREMIUM_ENTITLEMENT]);
}

export function isNewerRevenueCatEvent(
  eventTimestampMs: number,
  latestAppliedAt: Date | null,
): boolean {
  return latestAppliedAt === null || eventTimestampMs > latestAppliedAt.getTime();
}