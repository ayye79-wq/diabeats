import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUsdaFood } from "../server/services/usda-fooddata-central";
import { computeBioTraceRating } from "../shared/biotrace-rating";

test("normalizes USDA nutrients without converting missing values to zero", () => {
  const product = normalizeUsdaFood({
    description: "Onions, raw",
    dataType: "Foundation",
    foodNutrients: [
      { nutrient: { name: "Carbohydrate, by difference" }, amount: 9.34 },
      { nutrient: { name: "Total Sugars" }, amount: 4.24 },
      { nutrient: { name: "Sodium, Na" }, amount: 4 },
    ],
  }, 123);
  assert.equal(product.nutrition.carbohydratesGrams, 9.34);
  assert.equal(product.nutrition.proteinGrams, null);
  assert.equal(product.nutrition.sodiumMilligrams, 4);
  assert.equal(product.source.provider, "usda-fooddata-central");
  assert.equal(computeBioTraceRating(product).label, "insufficient-information");
});
