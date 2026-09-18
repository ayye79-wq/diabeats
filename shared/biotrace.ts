import { z } from "zod";

/**
 * BioTrace shared types and zod schemas.
 *
 * These describe the normalized product/nutrition contract that the server
 * derives from approved food-data providers and the deterministic rating
 * output produced by shared/biotrace-rating.ts. Nothing here is AI-generated;
 * every value is either copied from the provider or deterministically computed.
 */

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

const trimmed = (max: number) => z.string().trim().min(1).max(max);

/** A barcode: 8-14 digits (EAN-8, UPC-A, EAN-13, ITF-14). */
export const barcodeSchema = z
  .string()
  .trim()
  .regex(/^\d{8,14}$/u, "Barcode must be 8 to 14 digits");

export function isValidBarcode(value: unknown): value is string {
  return barcodeSchema.safeParse(value).success;
}

// ---------------------------------------------------------------------------
// Resolver evidence
// ---------------------------------------------------------------------------

export const identifierEvidenceTypeSchema = z.enum([
  "gtin",
  "gs1-gtin",
  "human-readable-plu",
  "retailer-specific-produce-id",
  "branded-produce-sticker",
  "provider-name-match",
  "label-photo",
  "unknown",
]);
export type IdentifierEvidenceType = z.infer<typeof identifierEvidenceTypeSchema>;

export const resolverConfidenceSchema = z.enum([
  "provider-confirmed",
  "provider-supported",
  "user-supplied",
  "unknown",
]);
export type ResolverConfidence = z.infer<typeof resolverConfidenceSchema>;

export const productResolutionSchema = z
  .object({
    kind: z.enum(["exact", "generic", "estimated", "confirmation-required", "unknown"]),
    evidenceType: identifierEvidenceTypeSchema,
    confidence: resolverConfidenceSchema,
    confirmationRequired: z.boolean(),
    explanation: trimmed(360),
  })
  .strict();
export type ProductResolution = z.infer<typeof productResolutionSchema>;

export type IdentifierOrigin = "camera" | "manual" | "qr";

export type ClassifiedIdentifier =
  | { kind: "gtin"; value: string; evidenceType: "gtin" }
  | { kind: "human-readable-plu"; value: string; evidenceType: "human-readable-plu" }
  | { kind: "unsupported"; value: string; evidenceType: "unknown" };

/**
 * A short numeric value is treated as a human-readable PLU only when the user
 * explicitly enters it. Camera output never becomes a PLU by inference.
 */
export function classifyBioTraceIdentifier(value: string, origin: IdentifierOrigin): ClassifiedIdentifier {
  const trimmedValue = value.trim();
  if (/^\d{8,14}$/u.test(trimmedValue)) {
    return { kind: "gtin", value: trimmedValue, evidenceType: "gtin" };
  }
  if (origin === "manual" && /^\d{4,5}$/u.test(trimmedValue)) {
    return { kind: "human-readable-plu", value: trimmedValue, evidenceType: "human-readable-plu" };
  }
  return { kind: "unsupported", value: trimmedValue, evidenceType: "unknown" };
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

/**
 * Per-serving and per-100g nutrition values. Any field may be null when the
 * provider does not supply it — we never invent numbers.
 */
export const nutritionFactsSchema = z
  .object({
    servingSize: trimmed(80).nullable(),
    servingQuantityGrams: z.number().finite().nonnegative().nullable(),
    energyKcal: z.number().finite().nonnegative().nullable(),
    carbohydratesGrams: z.number().finite().nonnegative().nullable(),
    sugarsGrams: z.number().finite().nonnegative().nullable(),
    addedSugarsGrams: z.number().finite().nonnegative().nullable(),
    fiberGrams: z.number().finite().nonnegative().nullable(),
    proteinGrams: z.number().finite().nonnegative().nullable(),
    fatGrams: z.number().finite().nonnegative().nullable(),
    saturatedFatGrams: z.number().finite().nonnegative().nullable(),
    sodiumMilligrams: z.number().finite().nonnegative().nullable(),
    /** basis of the raw values above: "serving" or "100g" */
    basis: z.enum(["serving", "100g", "unknown"]),
  })
  .strict();

export type NutritionFacts = z.infer<typeof nutritionFactsSchema>;

// ---------------------------------------------------------------------------
// Ingredient / additive indicators
// ---------------------------------------------------------------------------

export const sweetenerKindSchema = z.enum(["sugar", "artificial", "sugar-alcohol", "novel"]);
export type SweetenerKind = z.infer<typeof sweetenerKindSchema>;

export const ingredientIndicatorSchema = z
  .object({
    /** Detected sweeteners grouped by kind. */
    sweeteners: z
      .array(
        z
          .object({
            name: trimmed(80),
            kind: sweetenerKindSchema,
          })
          .strict(),
      )
      .max(40),
    /** Detected additives (E-numbers / named). */
    additives: z
      .array(
        z
          .object({
            code: trimmed(24),
            name: trimmed(120).nullable(),
          })
          .strict(),
      )
      .max(80),
    /** True when the ingredient list contains any recognized sweetener. */
    hasSweeteners: z.boolean(),
    /** True when the ingredient list contains any artificial sweetener. */
    hasArtificialSweeteners: z.boolean(),
    /** True when any additive was detected. */
    hasAdditives: z.boolean(),
  })
  .strict();

export type IngredientIndicator = z.infer<typeof ingredientIndicatorSchema>;

// ---------------------------------------------------------------------------
// GMO status (independent from the rating)
// ---------------------------------------------------------------------------

export const gmoStatusSchema = z.enum(["verified-free", "possible", "unknown"]);
export type GmoStatus = z.infer<typeof gmoStatusSchema>;

export const gmoAssessmentSchema = z
  .object({
    status: gmoStatusSchema,
    /** Human-readable, provider-sourced explanation of how status was derived. */
    reason: trimmed(280),
    /** Labels/tags that drove the assessment (e.g. "non-gmo", "organic"). */
    signals: z.array(trimmed(120)).max(20),
  })
  .strict();

export type GmoAssessment = z.infer<typeof gmoAssessmentSchema>;

// ---------------------------------------------------------------------------
// Provider source attribution
// ---------------------------------------------------------------------------

const sourceFreshnessSchema = z.enum(["live", "fresh-cache", "stale-cache"]);
const sourceBaseSchema = {
  /** Canonical URL for the product on the provider. */
  url: z.string().url().nullable(),
  /** ISO timestamp when this record was fetched/normalized. */
  retrievedAt: z.string().datetime(),
  /** How this response reached the user. Older persisted rows may omit it. */
  freshness: sourceFreshnessSchema.optional(),
};

export const productSourceSchema = z.discriminatedUnion("provider", [
  z
    .object({
      provider: z.literal("open-food-facts"),
      ...sourceBaseSchema,
      /** OFF data-completeness score if provided, else null. */
      completeness: z.number().finite().min(0).max(1).nullable(),
    })
    .strict(),
  z
    .object({
      provider: z.literal("usda-fooddata-central"),
      ...sourceBaseSchema,
      completeness: z.null(),
      /** USDA FoodData Central record identifier and data type. */
      fdcId: z.number().int().positive(),
      dataType: z.enum(["Branded", "Foundation", "SR Legacy", "Survey (FNDDS)"]),
      publicationDate: z.string().trim().max(40).nullable(),
      modifiedDate: z.string().trim().max(40).nullable(),
    })
    .strict(),
]);

export type ProductSource = z.infer<typeof productSourceSchema>;

// ---------------------------------------------------------------------------
// Structured (taxonomy-backed) ingredients
// ---------------------------------------------------------------------------

/**
 * One entry from Open Food Facts' `ingredients` taxonomy array: a
 * language-agnostic canonical id (e.g. "en:sugar", "en:e322") alongside the
 * original, possibly non-English, label text (e.g. "Sucre"). Using the
 * canonical id lets the ingredient-explanation engine recognize an
 * ingredient regardless of the product's label language, without inventing
 * or guessing a translation.
 */
export const structuredIngredientSchema = z
  .object({
    id: trimmed(160),
    text: trimmed(200).nullable(),
  })
  .strict();

export type StructuredIngredient = z.infer<typeof structuredIngredientSchema>;

// ---------------------------------------------------------------------------
// Normalized product
// ---------------------------------------------------------------------------

export const normalizedProductSchema = z
  .object({
    barcode: barcodeSchema.nullable(),
    name: trimmed(200),
    brand: trimmed(160).nullable(),
    quantity: trimmed(80).nullable(),
    categories: z.array(trimmed(120)).max(40),
    imageAvailable: z.boolean(),
    ingredientsText: z.string().trim().max(6000).nullable(),
    /** Flattened taxonomy-backed ingredients (language-agnostic), when the provider supplied them. */
    ingredientsStructured: z.array(structuredIngredientSchema).max(120).nullable(),
    nutrition: nutritionFactsSchema,
    ingredients: ingredientIndicatorSchema,
    gmo: gmoAssessmentSchema,
    labels: z.array(trimmed(120)).max(60),
    novaGroup: z.number().int().min(1).max(4).nullable(),
    nutriScore: z.enum(["a", "b", "c", "d", "e"]).nullable(),
    source: productSourceSchema,
    /** Optional for backward compatibility with normalized rows cached before the universal resolver. */
    resolution: productResolutionSchema.optional(),
  })
  .strict();

export type NormalizedProduct = z.infer<typeof normalizedProductSchema>;

// ---------------------------------------------------------------------------
// Search results
// ---------------------------------------------------------------------------

export const productSearchHitSchema = z
  .object({
    barcode: barcodeSchema.nullable(),
    name: trimmed(200),
    brand: trimmed(160).nullable(),
    imageAvailable: z.boolean(),
    nutriScore: z.enum(["a", "b", "c", "d", "e"]).nullable(),
  })
  .strict();

export type ProductSearchHit = z.infer<typeof productSearchHitSchema>;

export const productSearchResultSchema = z
  .object({
    query: trimmed(200),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    hits: z.array(productSearchHitSchema).max(50),
    source: z.literal("open-food-facts"),
  })
  .strict();

export type ProductSearchResult = z.infer<typeof productSearchResultSchema>;

// ---------------------------------------------------------------------------
// Provider error contract
// ---------------------------------------------------------------------------

export type ProviderErrorKind = "not_found" | "invalid_barcode" | "timeout" | "provider_unavailable" | "rate_limited";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status: number;

  constructor(kind: ProviderErrorKind, message: string) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.status = ProviderError.statusFor(kind);
  }

  static statusFor(kind: ProviderErrorKind): number {
    switch (kind) {
      case "not_found":
        return 404;
      case "invalid_barcode":
        return 400;
      case "rate_limited":
        return 429;
      case "timeout":
      case "provider_unavailable":
      default:
        return 503;
    }
  }
}
