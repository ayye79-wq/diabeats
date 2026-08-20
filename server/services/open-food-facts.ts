import {
  ProviderError,
  barcodeSchema,
  type GmoAssessment,
  type GmoStatus,
  type IngredientIndicator,
  type NormalizedProduct,
  type NutritionFacts,
  type ProductSearchHit,
  type ProductSearchResult,
  type SweetenerKind,
} from "../../shared/biotrace";

/**
 * Server-side Open Food Facts (OFF) client.
 *
 * Uses only the public read API. Every request is bounded by a timeout and
 * normalized into the shared BioTrace contract. We never invent values — any
 * missing provider field is normalized to null / false.
 */

const OFF_BASE = "https://world.openfoodfacts.org";
const OFF_STAGING = OFF_BASE; // single environment; kept explicit for clarity
const REQUEST_TIMEOUT_MS = 8_000;
const USER_AGENT = "DiabEats-BioTrace/1.0 (server-side; contact via app support)";

// Fields we request from OFF to keep payloads small and deterministic.
const PRODUCT_FIELDS = [
  "code",
  "product_name",
  "brands",
  "quantity",
  "categories_tags",
  "image_front_url",
  "ingredients_text",
  "ingredients_analysis_tags",
  "additives_tags",
  "additives_original_tags",
  "labels_tags",
  "nova_group",
  "nutriscore_grade",
  "nutriments",
  "serving_size",
  "serving_quantity",
  "completeness",
].join(",");

async function offFetch(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (res.status === 429) {
      throw new ProviderError("rate_limited", "Open Food Facts rate limit reached. Please try again shortly.");
    }
    if (!res.ok) {
      throw new ProviderError("provider_unavailable", `Open Food Facts responded with status ${res.status}.`);
    }
    return (await res.json()) as unknown;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError("timeout", "Open Food Facts request timed out.");
    }
    throw new ProviderError("provider_unavailable", "Could not reach Open Food Facts.");
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Field parsing helpers (defensive: provider fields are loosely typed)
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function asStringArray(value: unknown, max = 60): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asStringOrNull(entry))
    .filter((entry): entry is string => entry !== null)
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// Sweetener / additive detection (deterministic keyword sets)
// ---------------------------------------------------------------------------

const ARTIFICIAL_SWEETENERS: Record<string, string> = {
  aspartame: "Aspartame",
  sucralose: "Sucralose",
  saccharin: "Saccharin",
  acesulfame: "Acesulfame K",
  "acesulfame-k": "Acesulfame K",
  neotame: "Neotame",
  advantame: "Advantame",
  cyclamate: "Cyclamate",
};

const SUGAR_ALCOHOLS: Record<string, string> = {
  erythritol: "Erythritol",
  xylitol: "Xylitol",
  sorbitol: "Sorbitol",
  maltitol: "Maltitol",
  mannitol: "Mannitol",
  isomalt: "Isomalt",
  lactitol: "Lactitol",
};

const NOVEL_SWEETENERS: Record<string, string> = {
  stevia: "Stevia",
  "steviol glycosides": "Steviol glycosides",
  "monk fruit": "Monk fruit",
  "luo han guo": "Monk fruit",
};

const SUGAR_SWEETENERS: Record<string, string> = {
  sugar: "Sugar",
  sucrose: "Sucrose",
  "high fructose corn syrup": "High-fructose corn syrup",
  "corn syrup": "Corn syrup",
  "cane sugar": "Cane sugar",
  dextrose: "Dextrose",
  fructose: "Fructose",
  "agave syrup": "Agave syrup",
  honey: "Honey",
};

function detectSweeteners(ingredientsText: string | null): IngredientIndicator["sweeteners"] {
  if (!ingredientsText) return [];
  const haystack = ingredientsText.toLowerCase();
  const found = new Map<string, { name: string; kind: SweetenerKind }>();

  const scan = (dict: Record<string, string>, kind: SweetenerKind) => {
    for (const [needle, name] of Object.entries(dict)) {
      if (haystack.includes(needle)) found.set(name, { name, kind });
    }
  };

  scan(ARTIFICIAL_SWEETENERS, "artificial");
  scan(SUGAR_ALCOHOLS, "sugar-alcohol");
  scan(NOVEL_SWEETENERS, "novel");
  scan(SUGAR_SWEETENERS, "sugar");

  return [...found.values()].slice(0, 40);
}

function buildIngredientIndicator(
  ingredientsText: string | null,
  additiveTags: string[],
): IngredientIndicator {
  const sweeteners = detectSweeteners(ingredientsText);
  const additives = additiveTags
    .map((tag) => {
      // OFF tags look like "en:e300" or "en:e300-ascorbic-acid"
      const stripped = tag.replace(/^\w+:/u, "");
      const parts = stripped.split("-");
      const code = (parts[0] ?? stripped).toUpperCase();
      const name = parts.length > 1 ? parts.slice(1).join(" ") : null;
      return { code, name };
    })
    .filter((a) => a.code.length > 0)
    .slice(0, 80);

  return {
    sweeteners,
    additives,
    hasSweeteners: sweeteners.length > 0,
    hasArtificialSweeteners: sweeteners.some((s) => s.kind === "artificial"),
    hasAdditives: additives.length > 0,
  };
}

// ---------------------------------------------------------------------------
// GMO assessment (independent of the rating)
// ---------------------------------------------------------------------------

function buildGmoAssessment(
  _analysisTags: string[],
  labelTags: string[],
): GmoAssessment {
  const signals: string[] = [];
  const norm = (arr: string[]) => arr.map((t) => t.replace(/^\w+:/u, "").toLowerCase());
  const labels = norm(labelTags);

  const nonGmoLabel = labels.some((l) => l.includes("no-gmo") || l.includes("non-gmo") || l.includes("gmo-free"));
  const organic = labels.some((l) => l.includes("organic") || l.includes("bio"));

  let status: GmoStatus;
  let reason: string;

  if (nonGmoLabel) {
    status = "verified-free";
    reason = "Product carries a non-GMO / GMO-free label on Open Food Facts.";
    signals.push("non-gmo-label");
  } else if (organic) {
    // Organic certification restricts GMO use but is not an explicit non-GMO label.
    status = "verified-free";
    reason = "Product is labeled organic, which restricts GMO ingredients.";
    signals.push("organic-label");
  } else {
    status = "unknown";
    reason = "No GMO-related label or analysis was available for this product.";
  }

  return { status, reason, signals: signals.slice(0, 20) };
}

// ---------------------------------------------------------------------------
// Nutrition normalization
// ---------------------------------------------------------------------------

function buildNutrition(nutriments: Record<string, unknown>, servingSize: string | null, servingQuantity: number | null): NutritionFacts {
  // Keep a single honest basis for every nutrient. A mixed object (some values
  // per serving and some per 100g) would make the rating and UI misleading.
  const serving = (key: string) => asNumberOrNull(nutriments[`${key}_serving`]);
  const per100 = (key: string) => asNumberOrNull(nutriments[`${key}_100g`]);
  const servingKeys = ["energy-kcal", "carbohydrates", "sugars", "added-sugars", "fiber", "proteins", "fat", "saturated-fat", "sodium"];
  const hasAnyServing = servingKeys.some((key) => serving(key) !== null);
  const hasAny100g = servingKeys.some((key) => per100(key) !== null);
  const canConvert100gToServing = servingQuantity !== null && servingQuantity > 0;
  const basis: NutritionFacts["basis"] =
    hasAnyServing || (hasAny100g && canConvert100gToServing)
      ? "serving"
      : hasAny100g
        ? "100g"
        : "unknown";

  const convert100gToServing = (amount: number | null) =>
    amount === null || !canConvert100gToServing ? null : Math.round(((amount * servingQuantity!) / 100) * 100) / 100;
  const pick = (key: string) => {
    if (basis === "serving") return serving(key) ?? convert100gToServing(per100(key));
    if (basis === "100g") return per100(key);
    return null;
  };
  const sodiumG = pick("sodium");
  const sodiumMg = sodiumG !== null ? Math.round(sodiumG * 1000 * 100) / 100 : null;

  return {
    servingSize,
    servingQuantityGrams: servingQuantity,
    energyKcal: pick("energy-kcal"),
    carbohydratesGrams: pick("carbohydrates"),
    sugarsGrams: pick("sugars"),
    addedSugarsGrams: pick("added-sugars"),
    fiberGrams: pick("fiber"),
    proteinGrams: pick("proteins"),
    fatGrams: pick("fat"),
    saturatedFatGrams: pick("saturated-fat"),
    sodiumMilligrams: sodiumMg,
    basis,
  };
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

export function normalizeProduct(raw: unknown, requestedBarcode: string | null): NormalizedProduct {
  const product = asRecord(raw);
  const nutriments = asRecord(product["nutriments"]);
  const code = asStringOrNull(product["code"]) ?? requestedBarcode;
  const barcodeParsed = code && barcodeSchema.safeParse(code).success ? code : null;
  const name = asStringOrNull(product["product_name"]) ?? "Unnamed product";
  const ingredientsText = asStringOrNull(product["ingredients_text"]);
  const additiveTags = asStringArray(product["additives_tags"], 80);
  const labelTags = asStringArray(product["labels_tags"], 60);
  const analysisTags = asStringArray(product["ingredients_analysis_tags"], 40);
  const servingSize = asStringOrNull(product["serving_size"]);
  const servingQuantity = asNumberOrNull(product["serving_quantity"]);

  const nutriScoreRaw = asStringOrNull(product["nutriscore_grade"])?.toLowerCase() ?? null;
  const nutriScore =
    nutriScoreRaw && ["a", "b", "c", "d", "e"].includes(nutriScoreRaw)
      ? (nutriScoreRaw as NormalizedProduct["nutriScore"])
      : null;

  const novaRaw = asNumberOrNull(product["nova_group"]);
  const novaGroup = novaRaw !== null && novaRaw >= 1 && novaRaw <= 4 ? Math.round(novaRaw) : null;

  const completenessRaw = asNumberOrNull(product["completeness"]);
  const completeness = completenessRaw !== null ? Math.min(1, Math.max(0, completenessRaw)) : null;

  return {
    barcode: barcodeParsed,
    name: name.slice(0, 200),
    brand: asStringOrNull(product["brands"])?.split(",")[0]?.trim()?.slice(0, 160) ?? null,
    quantity: asStringOrNull(product["quantity"])?.slice(0, 80) ?? null,
    categories: asStringArray(product["categories_tags"], 40).map((c) => c.replace(/^\w+:/u, "").replace(/-/gu, " ")).slice(0, 40),
    imageAvailable: asStringOrNull(product["image_front_url"]) !== null,
    ingredientsText: ingredientsText ? ingredientsText.slice(0, 6000) : null,
    nutrition: buildNutrition(nutriments, servingSize, servingQuantity),
    ingredients: buildIngredientIndicator(ingredientsText, additiveTags),
    gmo: buildGmoAssessment(analysisTags, labelTags),
    labels: labelTags.map((t) => t.replace(/^\w+:/u, "").replace(/-/gu, " ")).slice(0, 60),
    novaGroup,
    nutriScore,
    source: {
      provider: "open-food-facts",
      url: barcodeParsed ? `${OFF_BASE}/product/${barcodeParsed}` : null,
      retrievedAt: new Date().toISOString(),
      completeness,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function lookupByBarcode(barcode: string): Promise<NormalizedProduct> {
  const parsed = barcodeSchema.safeParse(barcode);
  if (!parsed.success) {
    throw new ProviderError("invalid_barcode", "Barcode must be 8 to 14 digits.");
  }
  const code = parsed.data;
  const url = `${OFF_STAGING}/api/v2/product/${encodeURIComponent(code)}.json?fields=${encodeURIComponent(PRODUCT_FIELDS)}`;
  const json = asRecord(await offFetch(url));

  const status = asNumberOrNull(json["status"]);
  if (status === 0 || !json["product"]) {
    throw new ProviderError("not_found", "No product found for that barcode.");
  }
  return normalizeProduct(json["product"], code);
}

export async function searchByName(query: string, page = 1, pageSize = 20): Promise<ProductSearchResult> {
  const trimmedQuery = query.trim();
  const safePage = Math.min(Math.max(1, Math.floor(page)), 20);
  const safePageSize = Math.min(Math.max(1, Math.floor(pageSize)), 50);

  const params = new URLSearchParams({
    search_terms: trimmedQuery,
    page: String(safePage),
    page_size: String(safePageSize),
    fields: "code,product_name,brands,image_front_url,nutriscore_grade",
    json: "1",
  });
  const url = `${OFF_STAGING}/cgi/search.pl?${params.toString()}`;
  const json = asRecord(await offFetch(url));

  const productsRaw = Array.isArray(json["products"]) ? (json["products"] as unknown[]) : [];
  const hits: ProductSearchHit[] = productsRaw
    .map((entry) => {
      const p = asRecord(entry);
      const code = asStringOrNull(p["code"]);
      const barcode = code && barcodeSchema.safeParse(code).success ? code : null;
      const name = asStringOrNull(p["product_name"]);
      if (!name) return null;
      const grade = asStringOrNull(p["nutriscore_grade"])?.toLowerCase() ?? null;
      return {
        barcode,
        name: name.slice(0, 200),
        brand: asStringOrNull(p["brands"])?.split(",")[0]?.trim()?.slice(0, 160) ?? null,
        imageAvailable: asStringOrNull(p["image_front_url"]) !== null,
        nutriScore: grade && ["a", "b", "c", "d", "e"].includes(grade) ? (grade as ProductSearchHit["nutriScore"]) : null,
      } satisfies ProductSearchHit;
    })
    .filter((hit): hit is ProductSearchHit => hit !== null)
    .slice(0, safePageSize);

  return {
    query: trimmedQuery.slice(0, 200),
    total: asNumberOrNull(json["count"]) ?? hits.length,
    page: safePage,
    pageSize: safePageSize,
    hits,
    source: "open-food-facts",
  };
}
