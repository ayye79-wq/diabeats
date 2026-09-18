import assert from "node:assert/strict";
import test from "node:test";
import { isValidBarcode, ProviderError, type NormalizedProduct } from "../shared/biotrace";
import { computeBioTraceRating, RATING_DISPLAY } from "../shared/biotrace-rating";
import { buildBioTraceAssistantContext } from "../shared/biotrace-assistant";
import { resolveBioTraceQrPayload } from "../shared/biotrace-qr";
import {
  computeBloodSugarFit,
  labelAnalysisSchema,
  type LabelNutrition,
} from "../shared/biotrace-label";
import { analyzeIngredients } from "../shared/biotrace-ingredients";
import { readableBioTraceError } from "../lib/biotrace-errors";
import { containsUnsafeMedicalAdvice } from "../shared/ai-safety";
import { neutralBioTraceHistorySnapshot } from "../shared/biotrace-history";
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
    ingredientsStructured: null,
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

test("uses the safer educational BioTrace display labels", () => {
  assert.deepEqual(RATING_DISPLAY, {
    "better-fit": "Better choice",
    "use-with-caution": "Moderate impact",
    limit: "Higher impact",
    "insufficient-information": "Not enough information",
  });
});

test("routes QR payloads by type without following arbitrary URLs", () => {
  assert.deepEqual(resolveBioTraceQrPayload("3017620422003"), {
    kind: "barcode",
    barcode: "3017620422003",
    source: "raw-barcode",
  });
  assert.deepEqual(resolveBioTraceQrPayload("https://world.openfoodfacts.org/product/3017620422003/nutella"), {
    kind: "barcode",
    barcode: "3017620422003",
    source: "open-food-facts-url",
  });
  assert.deepEqual(resolveBioTraceQrPayload("https://id.gs1.org/01/03012345678903/10/LOT42"), {
    kind: "barcode",
    barcode: "03012345678903",
    source: "gs1-digital-link",
  });

  assert.deepEqual(resolveBioTraceQrPayload("https://example.com/product/3017620422003"), {
    kind: "url",
    url: "https://example.com/product/3017620422003",
    hostname: "example.com",
  });
  assert.deepEqual(resolveBioTraceQrPayload('{"name":"Grilled Chicken Teff Bowl","carbs":32}'), {
    kind: "content",
    format: "json",
    content: '{\n  "name": "Grilled Chicken Teff Bowl",\n  "carbs": 32\n}',
    summary: "Structured JSON object with 2 fields: name, carbs.",
  });
  assert.deepEqual(resolveBioTraceQrPayload("Grilled Chicken Teff Bowl"), {
    kind: "content",
    format: "text",
    content: "Grilled Chicken Teff Bowl",
    summary: "Plain-text QR content. It was not sent to Open Food Facts.",
  });
  assert.deepEqual(resolveBioTraceQrPayload("[1,2]"), {
    kind: "content",
    format: "json",
    content: "[\n  1,\n  2\n]",
    summary: "Structured JSON array with 2 items.",
  });
  assert.deepEqual(resolveBioTraceQrPayload("true"), {
    kind: "content",
    format: "json",
    content: "true",
    summary: "Structured JSON boolean.",
  });
  assert.equal(resolveBioTraceQrPayload("http://world.openfoodfacts.org/product/3017620422003").kind, "unsupported");
  assert.equal(resolveBioTraceQrPayload("mailto:test@example.com").kind, "unsupported");
  assert.equal(resolveBioTraceQrPayload("https://user:password@example.com").kind, "unsupported");
  assert.equal(resolveBioTraceQrPayload("https://world.openfoodfacts.org/product/%ZZ").kind, "unsupported");
  assert.equal(resolveBioTraceQrPayload("x".repeat(2_049)).kind, "unsupported");
});

test("rates a low-sugar, high-fiber minimally processed product as Better choice", () => {
  const rating = computeBioTraceRating(product());
  assert.equal(rating.label, "better-fit");
  assert.equal(rating.perServing, true);
  assert.ok(rating.factors.some((factor) => factor.key === "fiber" && factor.impact === "positive"));
});

test("rates a high-sugar, high-sodium ultra-processed product as Higher impact", () => {
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

test("keeps the default rating unchanged when no BioTrace profile is supplied", () => {
  const verifiedProduct = product({
    nutrition: {
      ...product().nutrition,
      carbohydratesGrams: 20,
      addedSugarsGrams: 2,
    },
  });
  assert.deepEqual(
    computeBioTraceRating(verifiedProduct),
    computeBioTraceRating(verifiedProduct, undefined),
  );
});

test("reweights verified facts deterministically for a stricter diabetes profile", () => {
  const verifiedProduct = product({
    nutrition: {
      ...product().nutrition,
      carbohydratesGrams: 20,
      addedSugarsGrams: 2,
    },
  });
  const profile = {
    diabetesType: "prediabetic" as const,
    dietGoal: "strict" as const,
    dailyCarbTarget: 30,
    usesInsulin: false,
  };

  const defaultRating = computeBioTraceRating(verifiedProduct);
  const personalized = computeBioTraceRating(verifiedProduct, profile);
  const repeated = computeBioTraceRating(verifiedProduct, { ...profile });

  assert.equal(defaultRating.label, "better-fit");
  assert.equal(personalized.label, "use-with-caution");
  assert.deepEqual(personalized, repeated);
  assert.ok(personalized.score < defaultRating.score);
  assert.ok(personalized.factors.some((factor) => factor.key === "profile-diabetes-carbohydrates"));
  assert.ok(personalized.factors.some((factor) => factor.key === "profile-strict-carbohydrates"));
  assert.ok(personalized.factors.some((factor) => factor.key === "profile-carb-target"));
  assert.match(personalized.summary, /your prediabetes profile/i);
});

test("uses a weight-loss goal only to reweight visible calorie and saturated-fat facts", () => {
  const verifiedProduct = product({
    nutrition: {
      ...product().nutrition,
      energyKcal: 480,
      saturatedFatGrams: 7,
    },
  });
  const personalized = computeBioTraceRating(verifiedProduct, {
    diabetesType: "type2",
    dietGoal: "weight-loss",
    dailyCarbTarget: 45,
    usesInsulin: true,
  });

  assert.ok(personalized.factors.some((factor) => factor.key === "profile-weight-loss-calories"));
  assert.ok(personalized.factors.some((factor) => factor.key === "profile-weight-loss-saturated-fat"));
  assert.equal(personalized.factors.some((factor) => factor.key.includes("insulin")), false);
});

test("explains when an active profile leaves an already low-carb serving unchanged", () => {
  const personalized = computeBioTraceRating(product(), {
    diabetesType: "prediabetic",
    dietGoal: "strict",
    dailyCarbTarget: 25,
    usesInsulin: false,
  });

  assert.ok(personalized.factors.some((factor) => factor.key === "profile-reviewed"));
  assert.match(personalized.summary, /did not add another caution/i);
});

test("does not pretend to personalize a rating without enough per-serving data", () => {
  const personalized = computeBioTraceRating(
    product({
      nutrition: {
        ...product().nutrition,
        servingSize: null,
        servingQuantityGrams: null,
        basis: "100g",
      },
    }),
    {
      diabetesType: "prediabetic",
      dietGoal: "strict",
      dailyCarbTarget: 25,
      usesInsulin: false,
    },
  );

  assert.equal(personalized.label, "insufficient-information");
  assert.ok(personalized.factors.some((factor) => factor.key === "profile-unavailable"));
  assert.doesNotMatch(personalized.summary, /personalized/i);
});

test("local BioTrace history snapshots strip profile-derived rating details", () => {
  const verifiedProduct = product({
    nutrition: {
      ...product().nutrition,
      carbohydratesGrams: 20,
      addedSugarsGrams: 2,
    },
  });
  const personalized = computeBioTraceRating(verifiedProduct, {
    diabetesType: "prediabetic",
    dietGoal: "strict",
    dailyCarbTarget: 25,
    usesInsulin: false,
  });
  const snapshot = neutralBioTraceHistorySnapshot({
    product: verifiedProduct,
    rating: personalized,
  });
  const serialized = JSON.stringify(snapshot);

  assert.equal(snapshot.rating.factors.some((factor) => factor.key.startsWith("profile-")), false);
  assert.doesNotMatch(serialized, /prediabetes|daily carb target|strict carb goal|profile-/i);
  assert.deepEqual(snapshot.rating, computeBioTraceRating(verifiedProduct));
});

test("ingredient evidence prevents a contradictory no-added-sugars claim", () => {
  const rating = computeBioTraceRating(product({
    ingredientsText: "Milk chocolate, sugar, corn syrup, peanuts.",
    nutrition: { ...product().nutrition, carbohydratesGrams: 32, sugarsGrams: 28, addedSugarsGrams: 0 },
    ingredients: {
      sweeteners: [{ name: "Sugar", kind: "sugar" }, { name: "Corn syrup", kind: "sugar" }],
      additives: [],
      hasSweeteners: true,
      hasArtificialSweeteners: false,
      hasAdditives: false,
    },
  }));
  const addedSugar = rating.factors.find((factor) => factor.key === "added-sugars");
  assert.equal(addedSugar?.label, "Contains added sugars or sweeteners");
  assert.equal(rating.factors.some((factor) => factor.label === "No added sugars"), false);
});

test("added-sugar wording distinguishes explicit zero, ingredient evidence, and unknown data", () => {
  const explicitZero = computeBioTraceRating(product());
  assert.equal(explicitZero.factors.find((factor) => factor.key === "added-sugars")?.label, "No added sugars");

  const evidenceOnly = computeBioTraceRating(product({
    nutrition: { ...product().nutrition, addedSugarsGrams: null },
    ingredients: {
      sweeteners: [{ name: "Honey", kind: "sugar" }],
      additives: [],
      hasSweeteners: true,
      hasArtificialSweeteners: false,
      hasAdditives: false,
    },
  }));
  assert.equal(evidenceOnly.factors.find((factor) => factor.key === "added-sugars")?.label, "Contains added sugars or sweeteners");

  const unknown = computeBioTraceRating(product({
    nutrition: { ...product().nutrition, addedSugarsGrams: null },
  }));
  assert.equal(unknown.factors.find((factor) => factor.key === "added-sugars")?.label, "Added sugar amount unavailable");
});

test("client BioTrace errors never expose raw provider response text", () => {
  const raw = new Error('404: {"error":"Open Food Facts responded with status 404"}');
  const message = readableBioTraceError(raw);
  assert.doesNotMatch(message, /Open Food Facts|status 404/u);
  assert.match(message, /couldn't find that product/u);
  assert.match(readableBioTraceError(new Error('429: {"error":"secret provider detail"}')), /temporarily busy/u);
  assert.match(readableBioTraceError(new Error('503: {"error":"secret provider detail"}')), /unavailable/u);
});

test("does not call a very high-carbohydrate, low-sugar product a Better choice", () => {
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

test("returns Not enough information rather than inventing a rating", () => {
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

test("builds Assistant label context only from a normalized product and deterministic rating", () => {
  const verifiedProduct = product({
    name: "Verified label product",
    nutrition: { ...product().nutrition, carbohydratesGrams: 14, sugarsGrams: 3 },
  });
  const rating = computeBioTraceRating(verifiedProduct);
  const context = buildBioTraceAssistantContext(verifiedProduct, rating);

  assert.equal(context.source, "BioTrace verified public package-label data");
  assert.equal(context.product.barcode, verifiedProduct.barcode);
  assert.equal(context.product.name, "Verified label product");
  assert.equal(context.rating.label, rating.label);
  assert.equal(context.rating.summary, rating.summary);
  assert.equal(context.nutrition.carbohydratesGrams, 14);
  assert.deepEqual(Object.keys(context.nutrition).sort(), [
    "basis",
    "carbohydratesGrams",
    "fiberGrams",
    "proteinGrams",
    "saturatedFatGrams",
    "servingSize",
    "sodiumMilligrams",
    "sugarsGrams",
  ]);
  assert.ok(context.ingredients);
  assert.equal(context.ingredients.sourceText, verifiedProduct.ingredientsText);
  assert.deepEqual(Object.keys(context.gmo).sort(), ["reason", "status"]);
});

test("feeds the full ingredient analysis into the Assistant context, not just nutrition", () => {
  const verifiedProduct = product({
    ingredientsText: "Water, cane sugar, maltodextrin, aspartame, citric acid.",
  });
  const rating = computeBioTraceRating(verifiedProduct);
  const context = buildBioTraceAssistantContext(verifiedProduct, rating);

  assert.ok(context.ingredients.explained.length >= 4);
  const names = context.ingredients.explained.map((i) => i.name.toLowerCase());
  assert.ok(names.some((n) => n.includes("cane sugar")));
  assert.ok(context.ingredients.sweeteners.length >= 2);
  assert.ok(context.ingredients.additives.length >= 1);
  // Passing a pre-computed analysis should be reflected verbatim.
  const analysis = analyzeIngredients(verifiedProduct.ingredientsText);
  const contextWithAnalysis = buildBioTraceAssistantContext(verifiedProduct, rating, analysis);
  assert.equal(contextWithAnalysis.ingredients.summary, analysis.summary);
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

test("exact Open Food Facts normalization retains the originally scanned barcode", () => {
  const normalized = normalizeProduct(
    {
      code: "0012000000133",
      product_name: "Cola",
      nutriments: {},
    },
    "012000000133",
  );
  assert.equal(normalized.barcode, "012000000133");
  assert.match(normalized.source.url ?? "", /012000000133/u);
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

test("computes the same educational meal-impact score from the same confirmed label values", () => {
  const nutrition: LabelNutrition = {
    calories: 120,
    carbohydratesGrams: 14,
    fiberGrams: 5,
    sugarsGrams: 3,
    addedSugarsGrams: 0,
    proteinGrams: 8,
    sodiumMilligrams: 120,
  };
  const first = computeBloodSugarFit(nutrition);
  const second = computeBloodSugarFit({ ...nutrition });
  assert.deepEqual(first, second);
  assert.ok(first.score > 50);
  assert.match(first.explanation, /14g carbohydrates/i);
  assert.equal(first.personalization, "none");
});

test("keeps an educational meal-impact summary neutral when no label values are confirmed", () => {
  const score = computeBloodSugarFit({
    calories: null,
    carbohydratesGrams: null,
    fiberGrams: null,
    sugarsGrams: null,
    addedSugarsGrams: null,
    proteinGrams: null,
    sodiumMilligrams: null,
  });
  assert.equal(score.score, 50);
  assert.deepEqual(score.knownFactors, []);
  assert.match(score.explanation, /limited information/i);
  assert.equal(score.personalization, "none");
});

test("personalizes confirmed label-photo values without using insulin status", () => {
  const nutrition: LabelNutrition = {
    calories: 240,
    carbohydratesGrams: 24,
    fiberGrams: 3,
    sugarsGrams: 8,
    addedSugarsGrams: 4,
    proteinGrams: 5,
    sodiumMilligrams: 180,
  };
  const profile = {
    diabetesType: "prediabetic" as const,
    dietGoal: "strict" as const,
    dailyCarbTarget: 25,
    usesInsulin: false,
  };
  const neutral = computeBloodSugarFit(nutrition);
  const personalized = computeBloodSugarFit(nutrition, profile);
  const withInsulin = computeBloodSugarFit(nutrition, { ...profile, usesInsulin: true });

  assert.equal(personalized.personalization, "applied");
  assert.ok(personalized.score < neutral.score);
  assert.equal(withInsulin.score, personalized.score);
  assert.equal(withInsulin.personalizationExplanation, personalized.personalizationExplanation);
});

test("marks label-photo personalization unavailable when no values are confirmed", () => {
  const score = computeBloodSugarFit(
    {
      calories: null,
      carbohydratesGrams: null,
      fiberGrams: null,
      sugarsGrams: null,
      addedSugarsGrams: null,
      proteinGrams: null,
      sodiumMilligrams: null,
    },
    {
      diabetesType: "type2",
      dietGoal: "strict",
      dailyCarbTarget: 30,
      usesInsulin: false,
    },
  );

  assert.equal(score.score, 50);
  assert.equal(score.personalization, "unavailable");
  assert.match(score.personalizationExplanation ?? "", /no confirmed per-serving/i);
});

test("derives neutral ingredient explanations only from recognized legible ingredient text", () => {
  const analysis = analyzeIngredients(
    "Ingredients: chicory root fiber, almond flour, maltodextrin, erythritol, cane sugar.",
  );
  for (const ingredient of analysis.ingredients) {
    assert.equal(containsUnsafeMedicalAdvice(ingredient.explanation), false);
    assert.doesNotMatch(ingredient.explanation, /\bavoid\b|\bspike\b|\bunsafe\b/i);
  }
});

test("requires explicit nullable fields in the photo-label extraction contract", () => {
  const completeShape = {
    extraction: {
      status: "incomplete",
      productName: null,
      brand: "Example Brand",
      servingSize: "1 bar (40g)",
      nutrition: {
        calories: 180,
        carbohydratesGrams: 22,
        fiberGrams: null,
        sugarsGrams: 8,
        addedSugarsGrams: null,
        proteinGrams: 4,
        sodiumMilligrams: 190,
      },
      ingredientsText: null,
    },
    ingredientAnalysis: analyzeIngredients(null),
  };
  assert.equal(labelAnalysisSchema.safeParse(completeShape).success, true);
  assert.equal(
    labelAnalysisSchema.safeParse({
      ...completeShape,
      extraction: {
        ...completeShape.extraction,
        nutrition: { ...completeShape.extraction.nutrition, sugarsGrams: undefined },
      },
    }).success,
    false,
  );
  assert.equal(
    labelAnalysisSchema.safeParse({
      ...completeShape,
      extraction: { ...completeShape.extraction, ingredientsText: "" },
    }).success,
    false,
  );
});