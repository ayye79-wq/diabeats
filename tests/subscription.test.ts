import assert from "node:assert/strict";
import test from "node:test";
import {
  hasActiveRevenueCatEntitlement,
  isNewerRevenueCatEvent,
  premiumStateFromRevenueCatEvent,
  revenueCatWebhookEventSchema,
} from "../shared/subscription";

const baseEvent = {
  id: "evt_test_1",
  app_user_id: "diabeats_123e4567-e89b-12d3-a456-426614174000",
  entitlement_ids: ["premium"],
  event_timestamp_ms: Date.now(),
  expiration_at_ms: Date.now() + 60_000,
};

test("RevenueCat activation events grant premium for a DiabEats entitlement", () => {
  const event = revenueCatWebhookEventSchema.parse({ ...baseEvent, type: "INITIAL_PURCHASE" });
  assert.equal(premiumStateFromRevenueCatEvent(event), true);
});

test("cancellation retains premium through the paid expiration date", () => {
  const now = Date.now();
  const event = revenueCatWebhookEventSchema.parse({
    ...baseEvent,
    type: "CANCELLATION",
    expiration_at_ms: now + 60_000,
  });
  assert.equal(premiumStateFromRevenueCatEvent(event, now), true);
});

test("expiration removes premium", () => {
  const event = revenueCatWebhookEventSchema.parse({ ...baseEvent, type: "EXPIRATION" });
  assert.equal(premiumStateFromRevenueCatEvent(event), false);
});

test("unrelated events and events without entitlements are ignored", () => {
  const unrelated = revenueCatWebhookEventSchema.parse({ ...baseEvent, type: "TEST" });
  const noEntitlement = revenueCatWebhookEventSchema.parse({
    ...baseEvent,
    type: "INITIAL_PURCHASE",
    entitlement_ids: [],
  });
  assert.equal(premiumStateFromRevenueCatEvent(unrelated), null);
  assert.equal(premiumStateFromRevenueCatEvent(noEntitlement), null);
});

test("a different RevenueCat entitlement cannot grant DiabEats Premium", () => {
  const event = revenueCatWebhookEventSchema.parse({
    ...baseEvent,
    type: "INITIAL_PURCHASE",
    entitlement_ids: ["Kalid – DiabEats Premium"],
  });
  assert.equal(premiumStateFromRevenueCatEvent(event), null);
  assert.equal(
    hasActiveRevenueCatEntitlement({
      entitlements: { active: { "Kalid – DiabEats Premium": { identifier: "legacy" } } },
    }),
    false,
  );
});

test("webhook rejects user IDs that were not issued by DiabEats", () => {
  assert.equal(
    revenueCatWebhookEventSchema.safeParse({
      ...baseEvent,
      app_user_id: "another-app-user",
      type: "INITIAL_PURCHASE",
    }).success,
    false,
  );
});

test("active RevenueCat customer entitlements are detected", () => {
  assert.equal(
    hasActiveRevenueCatEntitlement({ entitlements: { active: { premium: { identifier: "premium" } } } }),
    true,
  );
  assert.equal(hasActiveRevenueCatEntitlement({ entitlements: { active: {} } }), false);
  assert.equal(hasActiveRevenueCatEntitlement(null), false);
});

test("only newer RevenueCat events may replace subscription state", () => {
  const latest = new Date("2026-08-28T12:00:00.000Z");
  assert.equal(isNewerRevenueCatEvent(latest.getTime() + 1, latest), true);
  assert.equal(isNewerRevenueCatEvent(latest.getTime(), latest), false);
  assert.equal(isNewerRevenueCatEvent(latest.getTime() - 1, latest), false);
  assert.equal(isNewerRevenueCatEvent(latest.getTime(), null), true);
});