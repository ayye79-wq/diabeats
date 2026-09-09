import { ProviderError, type NormalizedProduct } from "../../shared/biotrace";

const FDC_BASE = "https://api.nal.usda.gov/fdc/v1";
const TIMEOUT_MS = 8_000;

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" ? value as RecordValue : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

async function fdcFetch(path: string, init?: RequestInit) {
  const apiKey = process.env.USDA_FDC_API_KEY?.trim();
  if (!apiKey) throw new ProviderError("provider_unavailable", "USDA FoodData Central is not configured.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(`${FDC_BASE}${path}${separator}api_key=${encodeURIComponent(apiKey)}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (response.status === 404) throw new ProviderError("not_found", "USDA food record not found.");
    if (response.status === 429) throw new ProviderError("rate_limited", "USDA FoodData Central is temporarily busy.");
    if (!response.ok) throw new ProviderError("provider_unavailable", `USDA FoodData Central responded with status ${response.status}.`);
    return await response.json() as unknown;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new ProviderError("timeout", "USDA FoodData Central timed out.");
    throw new ProviderError("provider_unavailable", "Could not reach USDA FoodData Central.");
  } finally {
    clearTimeout(timer);
  }
}

export type UsdaSearchHit = { id: number; name: string; brand: string | null; dataType: string | null };

export async function searchUsdaFoods(query: string, pageSize = 10): Promise<UsdaSearchHit[]> {
  const raw = record(await fdcFetch("/foods/search", {
    method: "POST",
    body: JSON.stringify({ query: query.trim().slice(0, 200), pageSize: Math.min(Math.max(pageSize, 1), 20) }),
  }));
  return (Array.isArray(raw.foods) ? raw.foods : []).map((item) => {
    const food = record(item);
    return {
      id: number(food.fdcId) ?? 0,
      name: text(food.description)?.slice(0, 200) ?? "Unnamed food",
      brand: (text(food.brandOwner) ?? text(food.brandName))?.slice(0, 160) ?? null,
      dataType: text(food.dataType),
    };
  }).filter((item) => item.id > 0);
}

const nutrientNumber = (food: RecordValue, names: string[]) => {
  const nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
  for (const item of nutrients) {
    const entry = record(item);
    const nutrient = record(entry.nutrient);
    const name = (text(nutrient.name) ?? text(entry.nutrientName) ?? "").toLowerCase();
    if (names.some((candidate) => name === candidate)) return number(entry.amount ?? entry.value);
  }
  return null;
};

export function normalizeUsdaFood(raw: unknown, id: number): NormalizedProduct {
  const food = record(raw);
  const ingredientsText = text(food.ingredients)?.slice(0, 6000) ?? null;
  const description = text(food.description)?.slice(0, 200) ?? "Unnamed USDA food";
  return {
    barcode: null,
    name: description,
    brand: (text(food.brandOwner) ?? text(food.brandName))?.slice(0, 160) ?? null,
    quantity: null,
    categories: [text(food.dataType) ?? "USDA food"],
    imageAvailable: false,
    ingredientsText,
    nutrition: {
      servingSize: "100 g reference amount",
      servingQuantityGrams: null,
      energyKcal: nutrientNumber(food, ["energy"]),
      carbohydratesGrams: nutrientNumber(food, ["carbohydrate, by difference"]),
      sugarsGrams: nutrientNumber(food, ["total sugars", "sugars, total including nlea"]),
      addedSugarsGrams: nutrientNumber(food, ["sugars, added"]),
      fiberGrams: nutrientNumber(food, ["fiber, total dietary"]),
      proteinGrams: nutrientNumber(food, ["protein"]),
      fatGrams: nutrientNumber(food, ["total lipid (fat)"]),
      saturatedFatGrams: nutrientNumber(food, ["fatty acids, total saturated"]),
      sodiumMilligrams: nutrientNumber(food, ["sodium, na"]),
      basis: "100g",
    },
    ingredients: { sweeteners: [], additives: [], hasSweeteners: false, hasArtificialSweeteners: false, hasAdditives: false },
    gmo: { status: "unknown", reason: "USDA FoodData Central does not provide a verified GMO claim for this result.", signals: [] },
    labels: [],
    novaGroup: null,
    nutriScore: null,
    source: {
      provider: "usda-fooddata-central",
      url: `https://fdc.nal.usda.gov/food-details/${id}/nutrients`,
      retrievedAt: new Date().toISOString(),
      completeness: null,
    },
  };
}

export async function lookupUsdaFood(id: number): Promise<NormalizedProduct> {
  return normalizeUsdaFood(await fdcFetch(`/food/${id}?format=full`), id);
}
