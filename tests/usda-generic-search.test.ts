import assert from "node:assert/strict";
import test from "node:test";

import { normalizedProductSchema, type NormalizedProduct } from "../shared/biotrace";
import { searchGenericFoods } from "../server/services/usda-food-data";
import { resolveNamedGenericCandidates } from "../server/services/usda-generic-resolver";

const foodNutrients = [
  { nutrientNumber: "1008", amount: 40 },
  { nutrientNumber: "205", amount: 9 },
  { nutrientNumber: "269", amount: 4 },
  { nutrientNumber: "539", amount: 1 },
  { nutrientNumber: "291", amount: 2 },
  { nutrientNumber: "203", amount: 1.2 },
  { nutrientNumber: "204", amount: 0.1 },
  { nutrientNumber: "606", amount: 0 },
  { nutrientNumber: "307", amount: 3 },
];

const foods = [
  {
    fdcId: 100,
    dataType: "Foundation",
    description: "Onions, yellow, raw",
    ingredients: "onion, honey, sucralose",
    brandedFoodCategory: "Vegetables",
    servingSize: 55,
    servingSizeUnit: "g",
    publishedDate: "2024-02-03",
    modifiedDate: "2025-04-06",
    foodNutrients,
    labelNutrients: {
      calories: { value: 22 },
      carbohydrates: { value: 5 },
      sugars: { value: 2 },
      addedSugars: { value: 1 },
      fiber: { value: 1 },
      protein: { value: 0.5 },
      fat: { value: 0 },
      saturatedFat: { value: 0 },
      sodium: { value: 2 },
    },
  },
  {
    fdcId: 101,
    dataType: "SR Legacy",
    description: "Onions, yellow, raw",
    foodNutrients,
  },
  {
    fdcId: 102,
    dataType: "SR Legacy",
    description: "Onions, yellow, raw",
    foodNutrients,
  },
  {
    fdcId: 103,
    dataType: "Branded",
    description: "Onions, yellow, raw",
    foodNutrients,
  },
];

test("generic USDA results preserve root-adapter nutrient and metadata normalization", async () => {
  const oldApiKey = process.env.USDA_API_KEY;
  const oldFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  process.env.USDA_API_KEY = "fixture-api-key";
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ foods }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const products = await searchGenericFoods("  yellow onion  ", 75);
    assert.deepEqual(requestBody, {
      query: "yellow onion",
      dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"],
      pageSize: 50,
      pageNumber: 1,
    });
    assert.equal(products.length, 3, "branded USDA search results must be excluded");

    const labelFood = products[0];
    assert.ok(normalizedProductSchema.safeParse(labelFood).success);
    assert.deepEqual(labelFood.nutrition, {
      servingSize: "55g",
      servingQuantityGrams: 55,
      energyKcal: 22,
      carbohydratesGrams: 5,
      sugarsGrams: 2,
      addedSugarsGrams: 1,
      fiberGrams: 1,
      proteinGrams: 0.5,
      fatGrams: 0,
      saturatedFatGrams: 0,
      sodiumMilligrams: 2,
      basis: "serving",
    });
    assert.equal(labelFood.ingredientsText, "onion, honey, sucralose");
    assert.deepEqual(labelFood.ingredients.sweeteners, [
      { name: "Honey", kind: "sugar" },
      { name: "Sucralose", kind: "artificial" },
    ]);
    assert.deepEqual(labelFood.categories, ["Vegetables"]);
    assert.deepEqual(
      {
        fdcId: labelFood.source.fdcId,
        dataType: labelFood.source.dataType,
        publicationDate: labelFood.source.publicationDate,
        modifiedDate: labelFood.source.modifiedDate,
        url: labelFood.source.url,
      },
      {
        fdcId: 100,
        dataType: "Foundation",
        publicationDate: "2024-02-03",
        modifiedDate: "2025-04-06",
        url: "https://fdc.nal.usda.gov/food-details/100/nutrients",
      },
    );

    assert.deepEqual(products[1].nutrition, {
      servingSize: null,
      servingQuantityGrams: null,
      energyKcal: 40,
      carbohydratesGrams: 9,
      sugarsGrams: 4,
      addedSugarsGrams: 1,
      fiberGrams: 2,
      proteinGrams: 1.2,
      fatGrams: 0.1,
      saturatedFatGrams: 0,
      sodiumMilligrams: 3,
      basis: "100g",
    });
  } finally {
    globalThis.fetch = oldFetch;
    if (oldApiKey === undefined) delete process.env.USDA_API_KEY;
    else process.env.USDA_API_KEY = oldApiKey;
  }
});

test("named USDA candidate decisions match the root resolver's conservative behavior", () => {
  const candidate = (name: string, calories: number): NormalizedProduct => ({
    barcode: null,
    name,
    brand: null,
    quantity: null,
    categories: [],
    imageAvailable: false,
    ingredientsText: null,
    nutrition: {
      servingSize: null,
      servingQuantityGrams: null,
      energyKcal: calories,
      carbohydratesGrams: null,
      sugarsGrams: null,
      addedSugarsGrams: null,
      fiberGrams: null,
      proteinGrams: null,
      fatGrams: null,
      saturatedFatGrams: null,
      sodiumMilligrams: null,
      basis: "100g",
    },
    ingredients: {
      sweeteners: [],
      additives: [],
      hasSweeteners: false,
      hasArtificialSweeteners: false,
      hasAdditives: false,
    },
    gmo: {
      status: "unknown",
      reason: "Not assessed.",
      signals: [],
    },
    labels: [],
    novaGroup: null,
    nutriScore: null,
    source: {
      provider: "usda-fooddata-central",
      url: "https://fdc.nal.usda.gov/food-details/500/nutrients",
      retrievedAt: "2025-01-01T00:00:00.000Z",
      completeness: null,
      fdcId: 500,
      dataType: "Foundation",
    },
  });

  const rootEquivalent = candidate("Onions, yellow, raw", 40);
  const duplicate = { ...rootEquivalent, source: { ...rootEquivalent.source, fdcId: 501 } };
  const distinct = candidate("Onions, yellow, cooked", 45);

  const unique = resolveNamedGenericCandidates("yellow onion", [rootEquivalent], "USDA FoodData Central");
  assert.equal(unique.kind, "generic");
  if (unique.kind === "generic") {
    assert.equal(unique.product.name, "Onions, yellow, raw");
    assert.equal(unique.product.resolution.explanation, "USDA FoodData Central returned one consistent name match. Confirm that it matches your food and portion.");
    assert.equal(unique.product.resolution.confirmationRequired, true);
  }

  const collapsedDuplicates = resolveNamedGenericCandidates("yellow onion", [rootEquivalent, duplicate], "USDA FoodData Central");
  assert.equal(collapsedDuplicates.kind, "generic");
  if (collapsedDuplicates.kind === "generic") {
    assert.equal(collapsedDuplicates.product.source.fdcId, 501, "the root resolver retains the last materially identical candidate");
  }
  const ambiguous = resolveNamedGenericCandidates("yellow onion", [rootEquivalent, distinct], "USDA FoodData Central");
  assert.deepEqual(ambiguous, {
    kind: "confirmation-required",
    candidateNames: ["Onions, yellow, raw", "Onions, yellow, cooked"],
    reason: "USDA FoodData Central returned conflicting matching records. Confirm the food or label before using nutrition values.",
  });
  assert.deepEqual(resolveNamedGenericCandidates("green pepper", [rootEquivalent], "USDA FoodData Central"), { kind: "unknown" });
  assert.deepEqual(resolveNamedGenericCandidates("   ", [rootEquivalent], "USDA FoodData Central"), { kind: "unknown" });
});