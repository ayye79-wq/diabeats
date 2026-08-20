import { z } from "zod";
import type { NormalizedProduct } from "./biotrace";

/**
 * Deterministic BioTrace rating.
 *
 * The rating is a transparent, rules-based label — NOT AI-generated and NOT a
 * medical diagnosis. It is computed purely from the normalized provider data.
 * The same product always produces the same rating. GMO status is reported
 * separately and never changes the rating (see shared/biotrace.ts).
 */

export const ratingLabelSchema = z.enum([
  "better-fit",
  "use-with-caution",
  "limit",
  "insufficient-information",
]);

export type RatingLabel = z.infer<typeof ratingLabelSchema>;

export const RATING_DISPLAY: Record<RatingLabel, string> = {
  "better-fit": "Better Fit",
  "use-with-caution": "Use with Caution",
  limit: "Limit",
  "insufficient-information": "Insufficient Information",
};

/** A single transparent factor that contributed to the rating. */
export const ratingFactorSchema = z
  .object({
    /** Machine key so the UI can group/localize factors. */
    key: z.string().trim().min(1).max(60),
    /** Human-readable factor description. */
    label: z.string().trim().min(1).max(200),
    /** Direction of influence on the rating. */
    impact: z.enum(["positive", "caution", "negative", "neutral"]),
    /** The measured value that drove the factor, if numeric. */
    value: z.number().finite().nullable(),
    /** Basis the value is expressed on. */
    basis: z.enum(["serving", "100g", "n/a"]),
  })
  .strict();

export type RatingFactor = z.infer<typeof ratingFactorSchema>;

export const biotraceRatingSchema = z
  .object({
    label: ratingLabelSchema,
    display: z.string().trim().min(1).max(60),
    /** Numeric score used only for ranking; higher = better fit. */
    score: z.number().finite(),
    factors: z.array(ratingFactorSchema).max(20),
    /** Per-serving basis actually used, when values were serving-based. */
    perServing: z.boolean(),
    /** Concise summary of why this label was chosen. */
    summary: z.string().trim().min(1).max(320),
    disclaimer: z.string().trim().min(1).max(320),
  })
  .strict();

export type BioTraceRating = z.infer<typeof biotraceRatingSchema>;

export const BIOTRACE_DISCLAIMER =
  "BioTrace ratings are an educational, rules-based summary of public label data—not medical advice or a safety guarantee. Verify the package label and consult your care plan for personal decisions.";

// ---------------------------------------------------------------------------
// Deterministic thresholds (per serving where available)
// ---------------------------------------------------------------------------

const THRESHOLDS = {
  carbohydratesGrams: { good: 15, caution: 30, limit: 45 },
  sugarsGrams: { good: 5, caution: 15 },
  addedSugarsGrams: { good: 0, caution: 8 },
  saturatedFatGrams: { good: 2, caution: 5 },
  sodiumMilligrams: { good: 140, caution: 400 },
  fiberGrams: { good: 3 },
  novaGroup: { caution: 3, negative: 4 },
} as const;

/**
 * Chooses the per-serving value for a nutrient. When the normalized nutrition
 * is on a 100g basis but a serving quantity is known, scales deterministically.
 * Returns null when the value cannot be expressed per serving without invention.
 */
function perServingValue(
  product: NormalizedProduct,
  value: number | null,
): { value: number | null; basis: "serving" | "100g" } {
  const { nutrition } = product;
  if (value === null) return { value: null, basis: nutrition.basis === "serving" ? "serving" : "100g" };
  if (nutrition.basis === "serving") return { value, basis: "serving" };
  if (nutrition.basis === "100g" && nutrition.servingQuantityGrams && nutrition.servingQuantityGrams > 0) {
    const scaled = (value * nutrition.servingQuantityGrams) / 100;
    return { value: Math.round(scaled * 100) / 100, basis: "serving" };
  }
  // Fall back to reporting the 100g value transparently.
  return { value, basis: "100g" };
}

function factor(
  key: string,
  label: string,
  impact: RatingFactor["impact"],
  value: number | null,
  basis: RatingFactor["basis"],
): RatingFactor {
  return { key, label, impact, value, basis };
}

/**
 * Computes the deterministic BioTrace rating for a normalized product.
 *
 * Scoring: each factor contributes a fixed integer to a running score. The
 * final label is chosen from the score AND a data-sufficiency check. When too
 * few core nutrition fields are present, the label is always
 * "insufficient-information" regardless of score.
 */
export function computeBioTraceRating(product: NormalizedProduct): BioTraceRating {
  const { nutrition, ingredients } = product;
  const factors: RatingFactor[] = [];
  let score = 0;
  let perServing = true;
  let elevatedCarbohydrates = false;
  let veryHighCarbohydrates = false;

  const core = [
    nutrition.sugarsGrams,
    nutrition.saturatedFatGrams,
    nutrition.sodiumMilligrams,
    nutrition.carbohydratesGrams,
  ];
  // We only apply per-serving thresholds when a serving can be established.
  // Values that are available only per 100g are still displayed transparently,
  // but cannot produce a potentially misleading serving-based rating.
  const canRatePerServing =
    nutrition.basis === "serving" || (nutrition.basis === "100g" && nutrition.servingQuantityGrams !== null && nutrition.servingQuantityGrams > 0);
  const knownCore = canRatePerServing ? core.filter((v) => v !== null).length : 0;

  // Total carbohydrates are an explicit, per-serving rating factor. Low sugar
  // does not make a high-starch product a better fit.
  {
    const { value, basis } = perServingValue(product, nutrition.carbohydratesGrams);
    if (basis === "100g") perServing = false;
    if (value !== null) {
      if (value <= THRESHOLDS.carbohydratesGrams.good) {
        score += 1;
        factors.push(factor("carbohydrates", `Lower carbohydrates (${value}g)`, "positive", value, basis));
      } else if (value <= THRESHOLDS.carbohydratesGrams.caution) {
        score -= 1;
        factors.push(factor("carbohydrates", `Moderate carbohydrates (${value}g)`, "caution", value, basis));
      } else if (value <= THRESHOLDS.carbohydratesGrams.limit) {
        elevatedCarbohydrates = true;
        score -= 2;
        factors.push(factor("carbohydrates", `High carbohydrates (${value}g)`, "negative", value, basis));
      } else {
        elevatedCarbohydrates = true;
        veryHighCarbohydrates = true;
        score -= 4;
        factors.push(factor("carbohydrates", `Very high carbohydrates (${value}g)`, "negative", value, basis));
      }
    }
  }

  // Sugars
  {
    const { value, basis } = perServingValue(product, nutrition.sugarsGrams);
    if (basis === "100g") perServing = false;
    if (value !== null) {
      if (value <= THRESHOLDS.sugarsGrams.good) {
        score += 2;
        factors.push(factor("sugars", `Low sugar (${value}g)`, "positive", value, basis));
      } else if (value <= THRESHOLDS.sugarsGrams.caution) {
        score -= 1;
        factors.push(factor("sugars", `Moderate sugar (${value}g)`, "caution", value, basis));
      } else {
        score -= 3;
        factors.push(factor("sugars", `High sugar (${value}g)`, "negative", value, basis));
      }
    }
  }

  // Added sugars
  {
    const { value, basis } = perServingValue(product, nutrition.addedSugarsGrams);
    if (value !== null) {
      if (value <= THRESHOLDS.addedSugarsGrams.good) {
        score += 1;
        factors.push(factor("added-sugars", "No added sugars", "positive", value, basis));
      } else if (value <= THRESHOLDS.addedSugarsGrams.caution) {
        score -= 1;
        factors.push(factor("added-sugars", `Some added sugars (${value}g)`, "caution", value, basis));
      } else {
        score -= 2;
        factors.push(factor("added-sugars", `High added sugars (${value}g)`, "negative", value, basis));
      }
    }
  }

  // Saturated fat
  {
    const { value, basis } = perServingValue(product, nutrition.saturatedFatGrams);
    if (basis === "100g") perServing = false;
    if (value !== null) {
      if (value <= THRESHOLDS.saturatedFatGrams.good) {
        score += 1;
        factors.push(factor("saturated-fat", `Low saturated fat (${value}g)`, "positive", value, basis));
      } else if (value <= THRESHOLDS.saturatedFatGrams.caution) {
        factors.push(factor("saturated-fat", `Moderate saturated fat (${value}g)`, "caution", value, basis));
      } else {
        score -= 2;
        factors.push(factor("saturated-fat", `High saturated fat (${value}g)`, "negative", value, basis));
      }
    }
  }

  // Sodium
  {
    const { value, basis } = perServingValue(product, nutrition.sodiumMilligrams);
    if (basis === "100g") perServing = false;
    if (value !== null) {
      if (value <= THRESHOLDS.sodiumMilligrams.good) {
        score += 1;
        factors.push(factor("sodium", `Low sodium (${value}mg)`, "positive", value, basis));
      } else if (value <= THRESHOLDS.sodiumMilligrams.caution) {
        factors.push(factor("sodium", `Moderate sodium (${value}mg)`, "caution", value, basis));
      } else {
        score -= 2;
        factors.push(factor("sodium", `High sodium (${value}mg)`, "negative", value, basis));
      }
    }
  }

  // Fiber
  {
    const { value, basis } = perServingValue(product, nutrition.fiberGrams);
    if (value !== null && value >= THRESHOLDS.fiberGrams.good) {
      score += 1;
      factors.push(factor("fiber", `Good source of fiber (${value}g)`, "positive", value, basis));
    }
  }

  // NOVA processing level
  if (product.novaGroup !== null) {
    if (product.novaGroup >= THRESHOLDS.novaGroup.negative) {
      score -= 2;
      factors.push(factor("processing", "Ultra-processed (NOVA 4)", "negative", product.novaGroup, "n/a"));
    } else if (product.novaGroup >= THRESHOLDS.novaGroup.caution) {
      score -= 1;
      factors.push(factor("processing", `Processed (NOVA ${product.novaGroup})`, "caution", product.novaGroup, "n/a"));
    } else {
      score += 1;
      factors.push(factor("processing", `Minimally processed (NOVA ${product.novaGroup})`, "positive", product.novaGroup, "n/a"));
    }
  }

  // Artificial sweeteners
  if (ingredients.hasArtificialSweeteners) {
    score -= 1;
    factors.push(factor("artificial-sweeteners", "Contains artificial sweeteners", "caution", null, "n/a"));
  } else if (ingredients.hasSweeteners) {
    factors.push(factor("sweeteners", "Contains added sweeteners", "caution", null, "n/a"));
  }

  // Additives
  if (ingredients.additives.length > 0) {
    if (ingredients.additives.length >= 5) {
      score -= 1;
      factors.push(factor("additives", `Many additives (${ingredients.additives.length})`, "caution", ingredients.additives.length, "n/a"));
    } else {
      factors.push(factor("additives", `${ingredients.additives.length} additive(s) listed`, "neutral", ingredients.additives.length, "n/a"));
    }
  }

  // ---- Determine label -----------------------------------------------------
  let label: RatingLabel;
  let summary: string;

  if (knownCore < 2) {
    label = "insufficient-information";
    summary =
      nutrition.basis === "100g" && !nutrition.servingQuantityGrams
        ? "The label only supplied values per 100g without a serving amount, so BioTrace cannot apply serving-based rating rules."
        : "Not enough label data was available to rate this product. Check the package for full nutrition information.";
  } else if (veryHighCarbohydrates) {
    label = "limit";
    summary = "This product is very high in total carbohydrates per serving, even if its sugar content is low.";
  } else if (score >= 4 && !elevatedCarbohydrates) {
    label = "better-fit";
    summary = "Based on the label, this is a comparatively better everyday choice.";
  } else if (score >= 0) {
    label = "use-with-caution";
    summary = "This product has a mix of positives and cautions; review the factors below.";
  } else {
    label = "limit";
    summary = "Based on the label, consider limiting this product or choosing an alternative.";
  }

  return {
    label,
    display: RATING_DISPLAY[label],
    score,
    factors,
    perServing,
    summary,
    disclaimer: BIOTRACE_DISCLAIMER,
  };
}
