import { z } from "zod";
import { ingredientAnalysisSchema } from "./biotrace-ingredients";
import type { BioTraceProfile } from "./biotrace-rating";

/**
 * The photo-label contract is deliberately separate from Open Food Facts
 * products. These values are transcribed from one user-confirmed package
 * image and are never treated as verified provider data.
 *
 * Ingredient explanations for this path use the exact same shared engine
 * (shared/biotrace-ingredients.ts) as the barcode/QR/search path, so all
 * BioTrace entry points converge on one explanation pipeline.
 */

const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();
const nullableNumber = (max: number) => z.number().finite().nonnegative().max(max).nullable();

export const labelScanStatusSchema = z.enum(["ready", "incomplete", "unreadable"]);
export type LabelScanStatus = z.infer<typeof labelScanStatusSchema>;

export const labelNutritionSchema = z
  .object({
    calories: nullableNumber(5_000),
    carbohydratesGrams: nullableNumber(500),
    fiberGrams: nullableNumber(200),
    sugarsGrams: nullableNumber(300),
    addedSugarsGrams: nullableNumber(300),
    proteinGrams: nullableNumber(300),
    sodiumMilligrams: nullableNumber(20_000),
  })
  .strict();

export type LabelNutrition = z.infer<typeof labelNutritionSchema>;

export const labelExtractionSchema = z
  .object({
    status: labelScanStatusSchema,
    productName: nullableText(200),
    brand: nullableText(160),
    servingSize: nullableText(120),
    nutrition: labelNutritionSchema,
    ingredientsText: z.string().trim().min(1).max(8_000).nullable(),
  })
  .strict();

export type LabelExtraction = z.infer<typeof labelExtractionSchema>;

export const labelAnalysisSchema = z
  .object({
    extraction: labelExtractionSchema,
    /** Built by the shared engine in shared/biotrace-ingredients.ts. */
    ingredientAnalysis: ingredientAnalysisSchema,
  })
  .strict();

export type LabelAnalysis = z.infer<typeof labelAnalysisSchema>;

export const bloodSugarFitSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    explanation: z.string().trim().min(1).max(360),
    knownFactors: z.array(z.string().trim().min(1).max(120)).max(8),
    personalization: z.enum(["none", "applied", "reviewed", "unavailable"]),
    personalizationExplanation: z.string().trim().min(1).max(240).nullable(),
  })
  .strict();

export type BloodSugarFit = z.infer<typeof bloodSugarFitSchema>;

export const LABEL_SCAN_DISCLAIMER =
  "This educational meal-impact summary is not a diagnosis, medical advice, or a prediction of your individual glucose response. Responses vary, so follow your healthcare professional's guidance for personal decisions.";

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/**
 * Computes a repeatable educational score from confirmed label values only.
 * Missing values contribute nothing; they are not estimated.
 */
export function computeBloodSugarFit(
  nutrition: LabelNutrition,
  profile?: BioTraceProfile,
): BloodSugarFit {
  let score = 50;
  const knownFactors: string[] = [];

  if (nutrition.carbohydratesGrams !== null) {
    const value = nutrition.carbohydratesGrams;
    score += value <= 15 ? 20 : value <= 30 ? 8 : value <= 45 ? -10 : -25;
    knownFactors.push(`${value}g carbohydrates`);
  }
  if (nutrition.sugarsGrams !== null) {
    const value = nutrition.sugarsGrams;
    score += value <= 5 ? 10 : value <= 15 ? -3 : -15;
    knownFactors.push(`${value}g sugars`);
  }
  if (nutrition.addedSugarsGrams !== null) {
    const value = nutrition.addedSugarsGrams;
    score += value === 0 ? 8 : value <= 8 ? -5 : -12;
    knownFactors.push(`${value}g added sugars`);
  }
  if (nutrition.fiberGrams !== null) {
    const value = nutrition.fiberGrams;
    score += value >= 3 ? 7 : value >= 1 ? 3 : -2;
    knownFactors.push(`${value}g fiber`);
  }
  if (nutrition.proteinGrams !== null) {
    const value = nutrition.proteinGrams;
    if (value >= 5) score += 3;
    knownFactors.push(`${value}g protein`);
  }
  if (nutrition.sodiumMilligrams !== null) {
    const value = nutrition.sodiumMilligrams;
    if (value > 400) score -= 3;
    else if (value <= 140) score += 2;
    knownFactors.push(`${value}mg sodium`);
  }

  const hasActiveProfile =
    !!profile &&
    (profile.diabetesType != null ||
      (profile.dietGoal !== undefined && profile.dietGoal !== "balanced") ||
      (profile.dailyCarbTarget !== null &&
        profile.dailyCarbTarget !== undefined &&
        profile.dailyCarbTarget < 45));
  let personalization: BloodSugarFit["personalization"] = "none";
  let personalizationExplanation: string | null = null;
  let profileAdjustment = 0;

  if (hasActiveProfile) {
    if (knownFactors.length === 0) {
      personalization = "unavailable";
      personalizationExplanation =
        "Your profile was considered, but no confirmed per-serving nutrition values were available to personalize this summary.";
    } else {
      const carbohydrates = nutrition.carbohydratesGrams;
      if (carbohydrates !== null) {
        const diabetesThreshold =
          profile.diabetesType === "prediabetic"
            ? 15
            : profile.diabetesType === "type1"
              ? 45
              : 30;
        if (profile.diabetesType && carbohydrates > diabetesThreshold) profileAdjustment -= 6;
        if (profile.dietGoal === "strict" && carbohydrates > 15) profileAdjustment -= 6;
        if (
          profile.dailyCarbTarget !== null &&
          profile.dailyCarbTarget !== undefined &&
          profile.dailyCarbTarget < 45 &&
          carbohydrates > profile.dailyCarbTarget / 3
        ) {
          profileAdjustment -= 6;
        }
      }
      if (
        profile.dietGoal === "strict" &&
        nutrition.addedSugarsGrams !== null &&
        nutrition.addedSugarsGrams > 0
      ) {
        profileAdjustment -= 5;
      }
      if (profile.dietGoal === "weight-loss" && nutrition.calories !== null) {
        if (nutrition.calories > 400) profileAdjustment -= 5;
        else if (nutrition.calories <= 200) profileAdjustment += 3;
      }

      if (profileAdjustment === 0) {
        personalization = "reviewed";
        personalizationExplanation =
          "Your saved profile did not add another caution for the confirmed per-serving values.";
      } else {
        personalization = "applied";
        personalizationExplanation =
          profileAdjustment < 0
            ? "Your saved profile adds extra caution to the confirmed carbohydrate, added-sugar, or calorie values."
            : "Your saved goal gives added weight to the confirmed lower-calorie value.";
      }
      score += profileAdjustment;
    }
  }

  const finalScore = clamp(score);
  const baseExplanation =
    knownFactors.length === 0
      ? "No scored nutrition values were confirmed, so this neutral summary has very limited information."
      : `This summary uses ${knownFactors.slice(0, 3).join(", ")}${knownFactors.length > 3 ? ", and other confirmed values" : ""}.`;
  const explanation = personalizationExplanation
    ? `${baseExplanation} ${personalizationExplanation}`
    : baseExplanation;

  return {
    score: finalScore,
    explanation,
    knownFactors: knownFactors.slice(0, 8),
    personalization,
    personalizationExplanation,
  };
}