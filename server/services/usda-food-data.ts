import {
  ProviderError,
  type IngredientIndicator,
  type NormalizedProduct,
  type NutritionFacts,
} from "../../shared/biotrace";

/**
 * USDA FoodData Central adapter.
 *
 * This module is server-only. The API key is read at request time so it is
 * never part of a client bundle.
 */

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";
const REQUEST_TIMEOUT_MS = 8_000;
const MIN_REQUEST_GAP_MS = 1_100;
const USER_AGENT = "DiabEats-BioTrace/1.0 (server-side; contact via app support)";
const GENERIC_DATA_TYPES = ["Foundation", "SR Legacy", "Survey (FNDDS)"] as const;
let usdaRequestQueue: Promise<void> = Promise.resolve();

type UsdaDataType = "Branded" | (typeof GENERIC_DATA_TYPES)[number];

type UsdaFood = {
  fdcId?: unknown;
  dataType?: unknown;
  description?: unknown;
  brandName?: unknown;
  brandOwner?: unknown;
  gtinUpc?: unknown;
  brandedFoodCategory?: unknown;
  ingredients?: unknown;
  servingSize?: unknown;
  servingSizeUnit?: unknown;
  publishedDate?: unknown;
  modifiedDate?: unknown;
  foodNutrients?: unknown;
  labelNutrients?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function asPositiveInteger(value: unknown): number | null {
  const parsed = asNumberOrNull(value);
  return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function asFood(value: unknown): UsdaFood | null {
  const record = asRecord(value);
  return asPositiveInteger(record.fdcId) !== null ? (record as UsdaFood) : null;
}

function asFoodArray(value: unknown): UsdaFood[] {
  return Array.isArray(value)
    ? value.map(asFood).filter((food): food is UsdaFood => food !== null)
    : [];
}

function dataType(value: unknown): UsdaDataType | null {
  if (value === "Branded" || GENERIC_DATA_TYPES.includes(value as (typeof GENERIC_DATA_TYPES)[number])) {
    return value as UsdaDataType;
  }
  return null;
}

function nutrientId(nutrient: Record<string, unknown>): string {
  const nutrientNumber = asStringOrNull(nutrient.nutrientNumber);
  if (nutrientNumber) return nutrientNumber;
  const id = asPositiveInteger(nutrient.nutrientId);
  if (id !== null) return String(id);
  return asStringOrNull(nutrient.name)?.toLowerCase() ?? "";
}

function foodNutrientValue(food: UsdaFood, ids: string[]): number | null {
  const nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
  for (const raw of nutrients) {
    const nutrient = asRecord(raw);
    if (!ids.includes(nutrientId(nutrient))) continue;
    const value = asNumberOrNull(nutrient.amount ?? nutrient.value);
    if (value !== null) return value;
  }
  return null;
}

function labelNutrientValue(food: UsdaFood, keys: string[]): number | null {
  const labels = asRecord(food.labelNutrients);
  for (const key of keys) {
    const entry = asRecord(labels[key]);
    const value = asNumberOrNull(entry.value ?? labels[key]);
    if (value !== null) return value;
  }
  return null;
}

function buildNutrition(food: UsdaFood): NutritionFacts {
  const servingSizeValue = asNumberOrNull(food.servingSize);
  const servingUnit = asStringOrNull(food.servingSizeUnit)?.toLowerCase() ?? null;
  const servingSize =
    servingSizeValue !== null && servingUnit
      ? `${servingSizeValue}${servingUnit === "g" ? "g" : ` ${servingUnit}`}`
      : null;
  const servingQuantityGrams = servingUnit === "g" ? servingSizeValue : null;
  const hasLabelNutrition = Object.keys(asRecord(food.labelNutrients)).length > 0;
  const amount = (labelKeys: string[], foodIds: string[]) =>
    hasLabelNutrition ? labelNutrientValue(food, labelKeys) : foodNutrientValue(food, foodIds);

  return {
    servingSize,
    servingQuantityGrams,
    energyKcal: amount(["calories"], ["1008", "208"]),
    carbohydratesGrams: amount(["carbohydrates"], ["205"]),
    sugarsGrams: amount(["sugars"], ["269"]),
    addedSugarsGrams: amount(["addedSugars"], ["539"]),
    fiberGrams: amount(["fiber"], ["291"]),
    proteinGrams: amount(["protein"], ["203"]),
    fatGrams: amount(["fat"], ["204"]),
    saturatedFatGrams: amount(["saturatedFat"], ["606"]),
    sodiumMilligrams: amount(["sodium"], ["307"]),
    basis: hasLabelNutrition ? "serving" : "100g",
  };
}

function buildIngredients(text: string | null): IngredientIndicator {
  if (!text) {
    return {
      sweeteners: [],
      additives: [],
      hasSweeteners: false,
      hasArtificialSweeteners: false,
      hasAdditives: false,
    };
  }
  const haystack = text.toLowerCase();
  const sweetenerNames = [
    ["sugar", "Sugar", "sugar"],
    ["sucrose", "Sucrose", "sugar"],
    ["high fructose corn syrup", "High-fructose corn syrup", "sugar"],
    ["corn syrup", "Corn syrup", "sugar"],
    ["glucose syrup", "Glucose syrup", "sugar"],
    ["maltose", "Maltose", "sugar"],
    ["invert sugar", "Invert sugar", "sugar"],
    ["cane sugar", "Cane sugar", "sugar"],
    ["brown sugar", "Brown sugar", "sugar"],
    ["honey", "Honey", "sugar"],
    ["molasses", "Molasses", "sugar"],
    ["agave syrup", "Agave syrup", "sugar"],
    ["rice syrup", "Rice syrup", "sugar"],
    ["malt syrup", "Malt syrup", "sugar"],
    ["fruit juice concentrate", "Fruit juice concentrate", "sugar"],
    ["fructose", "Fructose", "sugar"],
    ["dextrose", "Dextrose", "sugar"],
    ["aspartame", "Aspartame", "artificial"],
    ["sucralose", "Sucralose", "artificial"],
    ["acesulfame", "Acesulfame K", "artificial"],
    ["erythritol", "Erythritol", "sugar-alcohol"],
    ["xylitol", "Xylitol", "sugar-alcohol"],
    ["stevia", "Stevia", "novel"],
  ] as const;
  const sweeteners = sweetenerNames
    .filter(([needle]) => haystack.includes(needle))
    .map(([, name, kind]) => ({ name, kind }));
  return {
    sweeteners,
    additives: [],
    hasSweeteners: sweeteners.length > 0,
    hasArtificialSweeteners: sweeteners.some((entry) => entry.kind === "artificial"),
    hasAdditives: false,
  };
}

function normalizeFood(food: UsdaFood): NormalizedProduct {
  const fdcId = asPositiveInteger(food.fdcId);
  const type = dataType(food.dataType);
  if (fdcId === null || type === null) {
    throw new ProviderError("provider_unavailable", "USDA returned an incomplete food record.");
  }
  const name = asStringOrNull(food.description) ?? "Unnamed USDA food";
  const ingredientsText = asStringOrNull(food.ingredients);
  const brand = asStringOrNull(food.brandName) ?? asStringOrNull(food.brandOwner);
  const category = asStringOrNull(food.brandedFoodCategory);
  return {
    barcode: null,
    name: name.slice(0, 200),
    brand: brand?.slice(0, 160) ?? null,
    quantity: null,
    categories: category ? [category.slice(0, 120)] : [],
    imageAvailable: false,
    ingredientsText: ingredientsText?.slice(0, 6000) ?? null,
    nutrition: buildNutrition(food),
    ingredients: buildIngredients(ingredientsText),
    gmo: {
      status: "unknown",
      reason: "USDA FoodData Central did not provide a GMO assessment for this food.",
      signals: [],
    },
    labels: [],
    novaGroup: null,
    nutriScore: null,
    source: {
      provider: "usda-fooddata-central",
      url: `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients`,
      retrievedAt: new Date().toISOString(),
      completeness: null,
      fdcId,
      dataType: type,
      publicationDate: asStringOrNull(food.publishedDate),
      modifiedDate: asStringOrNull(food.modifiedDate),
    },
  };
}

async function searchUsdaFoods(apiKey: string, query: string, pageSize: number): Promise<unknown> {
  return queuedUsdaRequest(async () => {
    const url = new URL(`${USDA_BASE}/foods/search`);
    url.searchParams.set("api_key", apiKey);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: query.trim(),
          dataType: [...GENERIC_DATA_TYPES],
          pageSize,
          pageNumber: 1,
        }),
      });
      if (response.status === 429) throw new ProviderError("rate_limited", "USDA FoodData Central rate limit reached. Please try again shortly.");
      if (response.status === 401 || response.status === 403) throw new ProviderError("provider_unavailable", "USDA FoodData Central authentication was rejected.");
      if (!response.ok) throw new ProviderError("provider_unavailable", `USDA FoodData Central responded with status ${response.status}.`);
      return await response.json() as unknown;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new ProviderError("timeout", "USDA FoodData Central request timed out.");
      throw new ProviderError("provider_unavailable", "Could not reach USDA FoodData Central.");
    } finally {
      clearTimeout(timer);
    }
  });
}

async function queuedUsdaRequest(request: () => Promise<unknown>): Promise<unknown> {
  const previous = usdaRequestQueue;
  let release: () => void = () => undefined;
  usdaRequestQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await request();
      } catch (error) {
        const transientBadRequest =
          error instanceof ProviderError &&
          error.message.includes("status 400");
        if (!transientBadRequest || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1_500 * (attempt + 1)));
      }
    }
    throw new ProviderError("provider_unavailable", "USDA FoodData Central did not return a usable response.");
  } finally {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_GAP_MS));
    release();
  }
}

/**
 * Search USDA's generic Foundation, SR Legacy, and FNDDS datasets.
 */
export async function searchGenericFoods(query: string, pageSize = 20): Promise<NormalizedProduct[]> {
  const apiKey = process.env.USDA_API_KEY?.trim();
  if (!apiKey) return [];
  const safePageSize = Math.min(Math.max(1, Math.floor(pageSize)), 50);
  const search = asRecord(await searchUsdaFoods(apiKey, query, safePageSize));
  if (!Array.isArray(search.foods)) {
    throw new ProviderError("provider_unavailable", "USDA returned an invalid generic-food search response.");
  }
  return asFoodArray(search.foods)
    .filter((food) => dataType(food.dataType) !== null && GENERIC_DATA_TYPES.includes(dataType(food.dataType) as (typeof GENERIC_DATA_TYPES)[number]))
    .map((food) => normalizeFood(food))
    .filter((food) => food.name !== "Unnamed USDA food");
}