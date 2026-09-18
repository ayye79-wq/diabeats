import { z } from "zod";
import { computeBloodSugarFit, type BloodSugarFit, type LabelNutrition } from "./biotrace-label";

const menuNutrientSchema = z.number().finite().nonnegative().max(5_000);

export const structuredQrMenuItemSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(200),
    calories: menuNutrientSchema,
    carbs_g: menuNutrientSchema,
    fiber_g: menuNutrientSchema,
    sugar_g: menuNutrientSchema,
    protein_g: menuNutrientSchema,
  })
  .strict();

export const structuredQrMenuSchema = z
  .object({
    schema: z.literal("diabeats.test.menu.v1"),
    restaurant: z.string().trim().min(1).max(200),
    menu_id: z.string().trim().min(1).max(160),
    test_only: z.literal(true),
    items: z.array(structuredQrMenuItemSchema).min(1).max(40),
  })
  .strict();

export type StructuredQrMenu = z.infer<typeof structuredQrMenuSchema>;
export type StructuredQrMenuItem = z.infer<typeof structuredQrMenuItemSchema>;

function roundNutrition(value: number): number {
  return Math.round(value * 10) / 10;
}

export function parseStructuredQrMenu(content: string): StructuredQrMenu | null {
  try {
    const parsed: unknown = JSON.parse(content);
    const result = structuredQrMenuSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function calculateNetCarbohydrates(item: StructuredQrMenuItem): number {
  return roundNutrition(Math.max(0, item.carbs_g - item.fiber_g));
}

export function scoreStructuredQrMenuItem(item: StructuredQrMenuItem): BloodSugarFit {
  const nutrition: LabelNutrition = {
    calories: item.calories,
    carbohydratesGrams: item.carbs_g,
    fiberGrams: item.fiber_g,
    sugarsGrams: item.sugar_g,
    addedSugarsGrams: null,
    proteinGrams: item.protein_g,
    sodiumMilligrams: null,
  };

  return computeBloodSugarFit(nutrition);
}