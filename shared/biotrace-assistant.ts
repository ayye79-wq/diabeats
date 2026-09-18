import type { NormalizedProduct } from "./biotrace";
import type { BioTraceRating } from "./biotrace-rating";
import { analyzeIngredients, type IngredientAnalysis } from "./biotrace-ingredients";

/**
 * A compact, server-built context for educational Assistant conversations.
 * It deliberately contains only normalized provider data and the deterministic
 * BioTrace result — never a client-provided nutrition or rating payload.
 *
 * `ingredientAnalysis` is optional so existing callers keep working; pass it
 * (or let it be derived from `product.ingredientsText`) so the Assistant can
 * answer follow-up questions about specific ingredients and additives, not
 * just nutrition and the overall rating.
 */
export function buildBioTraceAssistantContext(
  product: NormalizedProduct,
  rating: BioTraceRating,
  ingredientAnalysis?: IngredientAnalysis,
) {
  const ingredients = ingredientAnalysis ?? analyzeIngredients(product.ingredientsText, product.ingredientsStructured);
  return {
    source: "BioTrace verified public package-label data",
    product: {
      barcode: product.barcode,
      name: product.name,
      brand: product.brand,
      retrievedAt: product.source.retrievedAt,
    },
    rating: {
      label: rating.label,
      display: rating.display,
      summary: rating.summary,
      factors: rating.factors.map(({ key, label, impact, value, basis }) => ({
        key,
        label,
        impact,
        value,
        basis,
      })),
    },
    nutrition: {
      basis: product.nutrition.basis,
      servingSize: product.nutrition.servingSize,
      carbohydratesGrams: product.nutrition.carbohydratesGrams,
      sugarsGrams: product.nutrition.sugarsGrams,
      fiberGrams: product.nutrition.fiberGrams,
      proteinGrams: product.nutrition.proteinGrams,
      saturatedFatGrams: product.nutrition.saturatedFatGrams,
      sodiumMilligrams: product.nutrition.sodiumMilligrams,
    },
    ingredients: {
      sourceText: ingredients.sourceText,
      summary: ingredients.summary,
      explained: ingredients.ingredients.map(({ name, category, explanation, bloodSugarRelevance, bloodSugarNote }) => ({
        name,
        category,
        explanation,
        bloodSugarRelevance,
        bloodSugarNote,
      })),
      sweeteners: ingredients.sweeteners.map(({ name, explanation, bloodSugarNote }) => ({ name, explanation, bloodSugarNote })),
      additives: ingredients.additives.map(({ name, explanation, bloodSugarNote }) => ({ name, explanation, bloodSugarNote })),
    },
    gmo: {
      status: product.gmo.status,
      reason: product.gmo.reason,
    },
  } as const;
}