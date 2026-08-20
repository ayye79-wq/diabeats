import assert from "node:assert/strict";
import test from "node:test";
import { isValidBarcode, ProviderError, type NormalizedProduct } from "../shared/biotrace";
import { computeBioTraceRating } from "../shared/biotrace-rating";
import { normalizeProduct } from "../server/services/open-food-facts";
import { productLookupRateLimit } from "../server/security";

function product(overrides: Partial<NormalizedProduct> = {}): NormalizedProduct {
  return {
    barcode: "00000000000000",
    name: "Test product",
    brand: "Test brand",
    quantity: "100g",
    categories: ["en:test"],
    imageAvailable: false,
    ingredientsText: "water",
    nutrition: {
      servingSize: "100g",
      servingQuantityGrams: 100,
      energyKcal: 100,
      carbohydratesGrams: 8,
      sugarsGrams: 2,
      addedSugarsGrams: 0,
      fiberGrams: 4,
      proteinGrams: 8,
      fatGrams: 2,
      saturatedFatGrams: 0.5,
      sodiumMilligrams: 80,
      basis: "serving",
    },
    ingredients: { sweeteners: [], additives: [], hasSweeteners: false, hasArtificialSweeteners: false, hasAdditives: false },
    gmo: { status: "unknown", reason: "No verified GMO statement was supplied.", signals: [] },
    labels: [],
    novaGroup: 1,
    nutriScore: "a",
    source: { provider: "open-food-facts", url: null, retrievedAt: "2026-01-01T00:00:00.000Z", completeness: 1 },
    ...overrides,
  };
}

test("accepts supported barcode lengths and rejects malformed inputs", () => {
  assert.equal(isValidBarcode("12345678"), true);
  assert.equal(isValidBarcode("12345678901234"), true);
  assert.equal(isValidBarcode("1234567"), false);
  assert.equal(isValidBarcode("1234abcd5678"), false);
  assert.equal(isValidBarcode("123456789012345"), false);
});

test("rates a low-sugar, high-fiber minimally processed product as Better Fit", () => {
  const rating = computeBioTraceRating(product());
  assert.equal(rating.label, "better-fit");
  assert.equal(rating.perServing, true);
  assert.ok(rating.factors.some((factor) => factor.key === "fiber" && factor.impact === "positive"));
});

test("rates a high-sugar, high-sodium ultra-processed product as Limit", () => {
  const rating = computeBioTraceRating(
    product({
      nutrition: {
        ...product().nutrition,
        sugarsGrams: 24,
        addedSugarsGrams: 20,
        saturatedFatGrams: 6,
        sodiumMilligrams: 580,
      },
      ingredients: {
        sweeteners: [{ name: "Sucralose", kind: "artificial" }],
        additives: [{ code: "E330", name: "citric acid" }, { code: "E950", name: "acesulfame k" }, { code: "E951", name: "aspartame" }, { code: "E202", name: "potassium sorbate" }, { code: "E621", name: "monosodium glutamate" }],
        hasSweeteners: true,
        hasArtificialSweeteners: true,
        hasAdditives: true,
      },
      novaGroup: 4,
    }),
  );
  assert.equal(rating.label, "limit");
  assert.ok(rating.factors.some((factor) => factor.key === "sugars" && factor.impact === "negative"));
});

test("does not call a very high-carbohydrate, low-sugar product a Better Fit", () => {
  const rating = computeBioTraceRating(
    product({
      nutrition: {
        ...product().nutrition,
        carbohydratesGrams: 60,
        sugarsGrams: 0,
        addedSugarsGrams: 0,
        saturatedFatGrams: 0,
        sodiumMilligrams: 0,
      },
      novaGroup: 1,
    }),
  );
  assert.equal(rating.label, "limit");
  assert.match(rating.summary, /very high in total carbohydrates/i);
  assert.ok(rating.factors.some((factor) => factor.key === "carbohydrates" && factor.impact === "negative"));
});

test("returns Insufficient Information rather than inventing a rating", () => {
  const rating = computeBioTraceRating(
    product({
      nutrition: {
        ...product().nutrition,
        carbohydratesGrams: null,
        sugarsGrams: null,
        saturatedFatGrams: null,
        sodiumMilligrams: 20,
      },
    }),
  );
  assert.equal(rating.label, "insufficient-information");
});

test("normalizes mixed provider nutrients into one honest serving basis", () => {
  const normalized = normalizeProduct(
    {
      code: "12345678",
      product_name: "Mixed basis food",
      serving_quantity: 50,
      nutriments: {
        carbohydrates_serving: 10,
        sugars_serving: 4,
        "saturated-fat_100g": 8,
        sodium_100g: 1,
      },
    },
    "12345678",
  );
  assert.equal(normalized.nutrition.basis, "serving");
  assert.equal(normalized.nutrition.carbohydratesGrams, 10);
  assert.equal(normalized.nutrition.saturatedFatGrams, 4);
  assert.equal(normalized.nutrition.sodiumMilligrams, 500);
});

test("does not score values available only per 100g without a serving amount", () => {
  const rating = computeBioTraceRating(
    product({
      nutrition: {
        ...product().nutrition,
        servingSize: null,
        servingQuantityGrams: null,
        sugarsGrams: 20,
        sodiumMilligrams: 500,
        basis: "100g",
      },
    }),
  );
  assert.equal(rating.label, "insufficient-information");
});

test("does not treat a palm-oil analysis tag as a GMO signal", () => {
  const normalized = normalizeProduct(
    {
      code: "12345678",
      product_name: "Palm oil test",
      ingredients_analysis_tags: ["en:from-palm-oil"],
      labels_tags: [],
      nutriments: {},
    },
    "12345678",
  );
  assert.equal(normalized.gmo.status, "unknown");
  assert.equal(normalized.gmo.signals.length, 0);
});

test("maps provider errors to safe, actionable HTTP statuses", () => {
  assert.equal(new ProviderError("not_found", "missing").status, 404);
  assert.equal(new ProviderError("invalid_barcode", "invalid").status, 400);
  assert.equal(new ProviderError("timeout", "slow").status, 503);
  assert.equal(new ProviderError("rate_limited", "busy").status, 429);
});

test("product lookup middleware blocks repeated provider-bound work", () => {
  const response = {
    statusCode: 200,
    setHeader() {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json() {},
  };
  const request = {
    ip: "biotrace-rate-limit-test",
    socket: { remoteAddress: "biotrace-rate-limit-test" },
    sessionIdentity: {
      id: "biotrace-rate-limit-test",
      isPremium: false,
      revenueCatUserId: "test",
      usageKey: "test",
    },
  };
  let allowed = 0;
  for (let i = 0; i < 40; i += 1) {
    productLookupRateLimit(request as any, response as any, () => {
      allowed += 1;
    });
  }
  productLookupRateLimit(request as any, response as any, () => {
    allowed += 1;
  });
  assert.equal(allowed, 40);
  assert.equal(response.statusCode, 429);
});