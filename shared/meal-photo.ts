import { z } from "zod";
import { nutritionFactsSchema, productSourceSchema, type NutritionFacts } from "./biotrace";

const shortText = (max: number) => z.string().trim().min(1).max(max);
const nullableNutrient = z.number().finite().nonnegative().nullable();

export const mealPhotoDetectionSchema = z.object({
  id: shortText(60),
  name: shortText(160),
  searchTerm: shortText(160),
  confidence: z.enum(["low", "medium", "high"]),
  portionLabel: shortText(100),
  estimatedGrams: z.number().finite().min(5).max(2_000),
  visibleEvidence: shortText(280),
}).strict();

export const mealPhotoVisionSchema = z.object({
  status: z.enum(["ready", "incomplete", "unreadable"]),
  mealName: shortText(160),
  detections: z.array(mealPhotoDetectionSchema).max(20),
  unknownItems: z.array(shortText(160)).max(12),
}).strict();

export const mealPhotoItemSchema = mealPhotoDetectionSchema.extend({
  portionGrams: z.number().finite().min(1).max(3_000),
  confirmed: z.boolean(),
  nutrition: nutritionFactsSchema.nullable(),
  source: productSourceSchema.nullable(),
  matchedFoodName: shortText(200).nullable(),
  resolutionNote: shortText(360),
}).strict();

export const mealNutritionTotalsSchema = z.object({
  energyKcal: nullableNutrient,
  carbohydratesGrams: nullableNutrient,
  sugarsGrams: nullableNutrient,
  fiberGrams: nullableNutrient,
  proteinGrams: nullableNutrient,
  fatGrams: nullableNutrient,
  netCarbohydratesGrams: nullableNutrient,
}).strict();

export const mealImpactSchema = z.object({
  level: z.enum(["low", "moderate", "high", "insufficient-evidence"]),
  explanation: shortText(600),
  drivers: z.array(shortText(220)).max(6),
}).strict();

export const mealPhotoAnalysisSchema = z.object({
  mealName: shortText(160),
  items: z.array(mealPhotoItemSchema).max(20),
  unknownItems: z.array(shortText(160)).max(12),
  totals: mealNutritionTotalsSchema,
  nutritionStatus: z.enum(["complete", "partial", "unavailable"]),
  impact: mealImpactSchema,
  disclaimer: shortText(600),
}).strict();

export const mealPhotoResponseSchema = mealPhotoAnalysisSchema.extend({
  saveToken: z.string().min(40).max(30_000),
}).strict();

export const savedMealPhotoAnalysisSchema = z.object({
  id: z.number().int().positive(),
  mealName: shortText(160),
  analysis: mealPhotoAnalysisSchema,
  createdAt: z.coerce.date().nullable(),
});

export type MealPhotoDetection = z.infer<typeof mealPhotoDetectionSchema>;
export type MealPhotoItem = z.infer<typeof mealPhotoItemSchema>;
export type MealPhotoAnalysis = z.infer<typeof mealPhotoAnalysisSchema>;
export type MealPhotoResponse = z.infer<typeof mealPhotoResponseSchema>;
export type MealNutritionTotals = z.infer<typeof mealNutritionTotalsSchema>;

const nutrientKeys = [
  "energyKcal",
  "carbohydratesGrams",
  "sugarsGrams",
  "fiberGrams",
  "proteinGrams",
  "fatGrams",
] as const;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function scaledNutrition(item: MealPhotoItem): Partial<Record<(typeof nutrientKeys)[number], number>> {
  if (!item.nutrition) return {};
  const basisGrams =
    item.nutrition.basis === "100g"
      ? 100
      : item.nutrition.basis === "serving"
        ? item.nutrition.servingQuantityGrams
        : null;
  if (!basisGrams || basisGrams <= 0) return {};
  const factor = item.portionGrams / basisGrams;
  return Object.fromEntries(
    nutrientKeys.flatMap((key) => {
      const value = item.nutrition?.[key];
      return value === null || value === undefined ? [] : [[key, round(value * factor)]];
    }),
  );
}

export function calculateMealPhotoAnalysis(input: {
  mealName: string;
  items: MealPhotoItem[];
  unknownItems?: string[];
}): MealPhotoAnalysis {
  const unknownItems = input.unknownItems ?? [];
  const scaled = input.items.map((item) => ({ item, values: scaledNutrition(item) }));
  const totals = Object.fromEntries(
    nutrientKeys.map((key) => {
      const values = scaled.map(({ values }) => values[key]).filter((value): value is number => value !== undefined);
      return [key, values.length ? round(values.reduce((sum, value) => sum + value, 0)) : null];
    }),
  ) as Omit<MealNutritionTotals, "netCarbohydratesGrams">;
  const netCarbohydratesGrams =
    totals.carbohydratesGrams === null
      ? null
      : round(Math.max(0, totals.carbohydratesGrams - (totals.fiberGrams ?? 0)));
  const resolvedItems = scaled.filter(({ values }) => values.carbohydratesGrams !== undefined);
  const missingCarbEvidence =
    resolvedItems.length !== input.items.length ||
    input.items.some((item) => !item.confirmed) ||
    unknownItems.length > 0;
  const nutritionStatus =
    resolvedItems.length === 0
      ? "unavailable"
      : missingCarbEvidence || nutrientKeys.some((key) => scaled.some(({ values }) => values[key] === undefined))
        ? "partial"
        : "complete";

  let level: MealPhotoAnalysis["impact"]["level"] = "insufficient-evidence";
  if (!missingCarbEvidence && totals.carbohydratesGrams !== null && netCarbohydratesGrams !== null) {
    level =
      totals.carbohydratesGrams >= 60 || netCarbohydratesGrams > 45
        ? "high"
        : netCarbohydratesGrams > 20
          ? "moderate"
          : "low";
  }
  const carbDrivers = resolvedItems
    .map(({ item, values }) => ({ name: item.name, carbs: values.carbohydratesGrams ?? 0 }))
    .sort((a, b) => b.carbs - a.carbs)
    .slice(0, 3)
    .filter((entry) => entry.carbs > 0)
    .map((entry) => `${entry.name}: about ${entry.carbs}g carbohydrate`);
  const balanceDrivers = [
    totals.fiberGrams !== null && totals.fiberGrams >= 8 ? `About ${totals.fiberGrams}g fiber is included in the summary.` : null,
    totals.proteinGrams !== null && totals.proteinGrams >= 20 ? `About ${totals.proteinGrams}g protein is included in the summary.` : null,
  ].filter((value): value is string => value !== null);
  const explanation =
    level === "insufficient-evidence"
      ? "There is not enough provider-backed nutrition for every visible food to classify this meal reliably. Review the foods and portions, and verify unknown items."
      : `This food-only meal-impact summary is ${level} based on about ${totals.carbohydratesGrams}g total carbohydrate and ${netCarbohydratesGrams}g net carbohydrate in the selected portions. Fiber, protein, preparation, and individual responses can change what happens in practice.`;

  return mealPhotoAnalysisSchema.parse({
    mealName: input.mealName,
    items: input.items,
    unknownItems,
    totals: { ...totals, netCarbohydratesGrams },
    nutritionStatus,
    impact: { level, explanation, drivers: [...carbDrivers, ...balanceDrivers].slice(0, 6) },
    disclaimer: "Educational meal-impact summary for the food only—not a prediction of your individual glucose response. Photo portions and provider nutrition may be inaccurate, and individual responses vary. Verify foods and portions before relying on this result.",
  });
}

export function withUpdatedPortion(
  analysis: MealPhotoAnalysis,
  itemId: string,
  portionGrams: number,
): MealPhotoAnalysis {
  return calculateMealPhotoAnalysis({
    mealName: analysis.mealName,
    unknownItems: analysis.unknownItems,
    items: analysis.items.map((item) => item.id === itemId ? { ...item, portionGrams } : item),
  });
}

export function withConfirmedItem(
  analysis: MealPhotoAnalysis,
  itemId: string,
): MealPhotoAnalysis {
  return calculateMealPhotoAnalysis({
    mealName: analysis.mealName,
    unknownItems: analysis.unknownItems,
    items: analysis.items.map((item) => item.id === itemId ? { ...item, confirmed: true } : item),
  });
}

export function normalizeNutritionTo100g(nutrition: NutritionFacts): NutritionFacts | null {
  if (nutrition.basis === "100g") return nutrition;
  if (nutrition.basis !== "serving" || !nutrition.servingQuantityGrams) return null;
  const factor = 100 / nutrition.servingQuantityGrams;
  const scaled = Object.fromEntries(
    nutrientKeys.map((key) => [key, nutrition[key] === null ? null : round(nutrition[key]! * factor)]),
  );
  return {
    ...nutrition,
    ...scaled,
    sodiumMilligrams: nutrition.sodiumMilligrams === null ? null : round(nutrition.sodiumMilligrams * factor),
    servingSize: "100g",
    servingQuantityGrams: 100,
    basis: "100g",
  };
}