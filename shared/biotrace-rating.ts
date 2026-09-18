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
  "better-fit": "Better choice",
  "use-with-caution": "Moderate impact",
  limit: "Higher impact",
  "insufficient-information": "Not enough information",
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

export const bioTraceProfileSchema = z
  .object({
    diabetesType: z.enum(["type1", "type2", "prediabetic", "gestational"]).nullable().optional(),
    dietGoal: z.enum(["strict", "balanced", "weight-loss"]).optional(),
    dailyCarbTarget: z.number().finite().positive().max(500).nullable().optional(),
    usesInsulin: z.boolean().optional(),
  })
  .strict();

export type BioTraceProfile = z.infer<typeof bioTraceProfileSchema>;

export function getBioTraceProfileHeaders(profile: BioTraceProfile): Record<string, string> {
  return { "X-BioTrace-Profile": JSON.stringify(profile) };
}

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

const DIABETES_PROFILE_LABELS: Record<Exclude<NonNullable<BioTraceProfile["diabetesType"]>, null>, string> = {
  type1: "Type 1",
  type2: "Type 2",
  prediabetic: "prediabetes",
  gestational: "gestational diabetes",
};

/**
 * Applies only transparent weighting changes to facts already present on the
 * provider label. A profile never creates a missing value or changes the
 * underlying product data.
 */
function applyProfileWeighting(
  product: NormalizedProduct,
  profile: BioTraceProfile | undefined,
  canRatePerServing: boolean,
  knownCore: number,
  factors: RatingFactor[],
): { adjustment: number; notes: string[] } {
  const hasActiveProfile =
    !!profile &&
    (profile.diabetesType != null ||
      (profile.dietGoal !== undefined && profile.dietGoal !== "balanced") ||
      (profile.dailyCarbTarget !== null &&
        profile.dailyCarbTarget !== undefined &&
        profile.dailyCarbTarget < 45));
  if (!profile || !hasActiveProfile) return { adjustment: 0, notes: [] };
  if (knownCore < 2) {
    factors.push(
      factor(
        "profile-unavailable",
        "Your profile could not be applied without enough per-serving label data",
        "neutral",
        null,
        "n/a",
      ),
    );
    return { adjustment: 0, notes: [] };
  }

  let adjustment = 0;
  const notes: string[] = [];
  const addAdjustment = (
    key: string,
    label: string,
    delta: number,
    value: number | null,
    basis: RatingFactor["basis"],
    note: string,
  ) => {
    if (delta === 0) return;
    adjustment += delta;
    factors.push(factor(key, label, delta > 0 ? "positive" : "negative", value, basis));
    notes.push(note);
  };

  const carbohydrates = perServingValue(product, product.nutrition.carbohydratesGrams);
  const addedSugars = perServingValue(product, product.nutrition.addedSugarsGrams);
  const saturatedFat = perServingValue(product, product.nutrition.saturatedFatGrams);
  const calories = perServingValue(product, product.nutrition.energyKcal);

  if (canRatePerServing && carbohydrates.value !== null) {
    const diabetesType = profile.diabetesType;
    const diabetesThreshold =
      diabetesType === "prediabetic"
        ? 15
        : diabetesType === "type1"
          ? 45
          : 30;
    if (diabetesType && carbohydrates.value > diabetesThreshold) {
      addAdjustment(
        "profile-diabetes-carbohydrates",
        `${DIABETES_PROFILE_LABELS[diabetesType]} profile: extra emphasis on total carbohydrates (${carbohydrates.value}g)`,
        -1,
        carbohydrates.value,
        carbohydrates.basis,
        `Your ${DIABETES_PROFILE_LABELS[diabetesType]} profile puts extra emphasis on this carbohydrate amount.`,
      );
    }

    if (profile.dietGoal === "strict" && carbohydrates.value > THRESHOLDS.carbohydratesGrams.good) {
      addAdjustment(
        "profile-strict-carbohydrates",
        `Strict carb goal: extra emphasis on ${carbohydrates.value}g of carbohydrates`,
        -1,
        carbohydrates.value,
        carbohydrates.basis,
        "Your strict carb goal puts extra emphasis on this carbohydrate amount.",
      );
    }

    if (
      profile.dailyCarbTarget !== null &&
      profile.dailyCarbTarget !== undefined &&
      profile.dailyCarbTarget < 45 &&
      carbohydrates.value > profile.dailyCarbTarget / 3
    ) {
      addAdjustment(
        "profile-carb-target",
        `Your ${profile.dailyCarbTarget}g daily carb target makes this serving more significant`,
        -1,
        carbohydrates.value,
        carbohydrates.basis,
        `Your ${profile.dailyCarbTarget}g daily carb target makes this serving more significant.`,
      );
    }
  }

  if (profile.dietGoal === "strict" && addedSugars.value !== null && addedSugars.value > 0) {
    addAdjustment(
      "profile-strict-added-sugars",
      `Strict goal: extra emphasis on added sugars (${addedSugars.value}g)`,
      -1,
      addedSugars.value,
      addedSugars.basis,
      "Your strict goal puts extra emphasis on the added sugar amount.",
    );
  }

  if (profile.dietGoal === "weight-loss") {
    if (saturatedFat.value !== null && saturatedFat.value > THRESHOLDS.saturatedFatGrams.caution) {
      addAdjustment(
        "profile-weight-loss-saturated-fat",
        `Weight-loss goal: extra emphasis on saturated fat (${saturatedFat.value}g)`,
        -1,
        saturatedFat.value,
        saturatedFat.basis,
        "Your weight-loss goal puts extra emphasis on this saturated-fat amount.",
      );
    }
    if (calories.value !== null && calories.value > 400) {
      addAdjustment(
        "profile-weight-loss-calories",
        `Weight-loss goal: extra emphasis on calories (${calories.value} kcal)`,
        -1,
        calories.value,
        calories.basis,
        "Your weight-loss goal puts extra emphasis on this calorie amount.",
      );
    } else if (
      calories.value !== null &&
      calories.value <= 200 &&
      (saturatedFat.value === null || saturatedFat.value <= THRESHOLDS.saturatedFatGrams.good)
    ) {
      addAdjustment(
        "profile-weight-loss-fit",
        "Weight-loss goal: lower-calorie, lower-saturated-fat profile",
        1,
        calories.value,
        calories.basis,
        "Your weight-loss goal gives added weight to the lower-calorie, lower-saturated-fat profile.",
      );
    }
  }

  if (adjustment === 0) {
    factors.push(
      factor(
        "profile-reviewed",
        "Your saved profile did not add another caution for the available serving-based values",
        "neutral",
        null,
        "n/a",
      ),
    );
    notes.push("Your saved profile did not add another caution for the available serving-based values.");
  }

  return { adjustment, notes };
}

/**
 * Computes the deterministic BioTrace rating for a normalized product.
 *
 * Scoring: each factor contributes a fixed integer to a running score. The
 * final label is chosen from the score AND a data-sufficiency check. When too
 * few core nutrition fields are present, the label is always
 * "insufficient-information" regardless of score.
 */
export function computeBioTraceRating(product: NormalizedProduct, profile?: BioTraceProfile): BioTraceRating {
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
    const ingredientEvidence = ingredients.hasSweeteners;
    if (ingredientEvidence && (value === null || value <= THRESHOLDS.addedSugarsGrams.good)) {
      score -= 1;
      factors.push(factor("added-sugars", "Contains added sugars or sweeteners", "caution", null, "n/a"));
    } else if (value !== null) {
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
    } else {
      factors.push(factor("added-sugars", "Added sugar amount unavailable", "neutral", null, "n/a"));
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

  const profileWeighting = applyProfileWeighting(product, profile, canRatePerServing, knownCore, factors);
  score += profileWeighting.adjustment;

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

  if (profileWeighting.notes.length > 0 && label !== "insufficient-information") {
    summary = `${summary} ${profileWeighting.notes.join(" ")}`.slice(0, 320);
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
