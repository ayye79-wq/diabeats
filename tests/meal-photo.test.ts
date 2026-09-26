import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateMealPhotoAnalysis,
  mealPhotoVisionSchema,
  withUpdatedPortion,
  type MealPhotoItem,
} from "../shared/meal-photo";

function item(id: string, name: string, carbs: number | null, extras: Partial<MealPhotoItem["nutrition"]> = {}): MealPhotoItem {
  return {
    id,
    name,
    searchTerm: name,
    confidence: "high",
    portionLabel: "about 100g",
    estimatedGrams: 100,
    portionGrams: 100,
    confirmed: true,
    visibleEvidence: `${name} is visible`,
    nutrition: {
      servingSize: "100g",
      servingQuantityGrams: 100,
      energyKcal: 100,
      carbohydratesGrams: carbs,
      sugarsGrams: 2,
      addedSugarsGrams: null,
      fiberGrams: 3,
      proteinGrams: 5,
      fatGrams: 2,
      saturatedFatGrams: null,
      sodiumMilligrams: null,
      basis: "100g",
      ...extras,
    },
    source: {
      provider: "usda-fooddata-central",
      url: "https://fdc.nal.usda.gov/food-details/1/nutrients",
      retrievedAt: new Date("2026-01-01").toISOString(),
      completeness: null,
      fdcId: 1,
      dataType: "Foundation",
      publicationDate: null,
      modifiedDate: null,
    },
    matchedFoodName: name,
    resolutionNote: "USDA match",
  };
}

test("aggregates portions while keeping sugar separate from carbohydrate", () => {
  const analysis = calculateMealPhotoAnalysis({
    mealName: "Test plate",
    items: [item("rice", "Rice", 30), item("chicken", "Chicken", 0, { sugarsGrams: 0 })],
  });
  assert.equal(analysis.totals.carbohydratesGrams, 30);
  assert.equal(analysis.totals.sugarsGrams, 2);
  assert.equal(analysis.totals.netCarbohydratesGrams, 24);
  assert.equal(analysis.impact.level, "moderate");
  assert.match(analysis.impact.drivers[0], /Rice/);
});

test("portion edits deterministically recalculate totals and impact", () => {
  const initial = calculateMealPhotoAnalysis({ mealName: "Rice", items: [item("rice", "Rice", 60)] });
  const updated = withUpdatedPortion(initial, "rice", 25);
  assert.equal(initial.impact.level, "high");
  assert.equal(updated.totals.carbohydratesGrams, 15);
  assert.equal(updated.impact.level, "low");
});

test("unknown foods and missing carbohydrate evidence prevent classification", () => {
  const unknown = calculateMealPhotoAnalysis({
    mealName: "Mixed plate",
    items: [item("salad", "Salad", 8)],
    unknownItems: ["unidentified sauce"],
  });
  assert.equal(unknown.impact.level, "insufficient-evidence");
  assert.equal(unknown.nutritionStatus, "partial");

  const missing = calculateMealPhotoAnalysis({
    mealName: "Mixed plate",
    items: [item("food", "Food", null)],
  });
  assert.equal(missing.impact.level, "insufficient-evidence");
  assert.equal(missing.nutritionStatus, "unavailable");
});

test("rejects malformed vision output instead of inventing missing evidence", () => {
  const malformed = mealPhotoVisionSchema.safeParse({
    status: "ready",
    mealName: "Plate",
    detections: [{
      id: "food-1",
      name: "Rice",
      confidence: "high",
      estimatedGrams: 150,
    }],
    unknownItems: [],
  });
  assert.equal(malformed.success, false);
});

test("requires user confirmation before a generic match can drive classification", () => {
  const unconfirmed = item("rice", "Rice", 30);
  unconfirmed.confirmed = false;
  const analysis = calculateMealPhotoAnalysis({ mealName: "Rice", items: [unconfirmed] });
  assert.equal(analysis.impact.level, "insufficient-evidence");
});