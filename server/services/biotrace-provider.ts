import { ProviderError, type NormalizedProduct } from "../../shared/biotrace";
import { lookupByBarcode as lookupOpenFoodFacts, searchByName as searchOpenFoodFacts } from "./open-food-facts";
import { resolveNamedGenericCandidates, type GenericCandidateResolution } from "./biotrace-resolver";
import { isUsdaConfigured, lookupByBarcode as lookupUsdaByBarcode, searchGenericFoods } from "./usda-food-data";

/**
 * Ordered provider policy for BioTrace:
 * 1. Open Food Facts remains the exact-product source of truth.
 * 2. USDA is consulted only after a definitive Open Food Facts miss.
 * 3. USDA generic records are only used when the user-name match is
 *    sufficiently constrained; conflicts remain confirmation-required.
 */

export async function lookupByBarcode(barcode: string): Promise<NormalizedProduct> {
  try {
    return await lookupOpenFoodFacts(barcode);
  } catch (error) {
    if (!(error instanceof ProviderError) || error.kind !== "not_found") throw error;
  }

  if (!isUsdaConfigured()) throw new ProviderError("not_found", "No approved provider returned a product for that barcode.");
  return lookupUsdaByBarcode(barcode);
}

export async function searchByName(
  query: string,
  page = 1,
  pageSize = 20,
): Promise<Awaited<ReturnType<typeof searchOpenFoodFacts>>> {
  const result = await searchOpenFoodFacts(query, page, pageSize);
  if (!isUsdaConfigured() || result.genericResolution.kind === "generic" || result.genericResolution.kind === "confirmation-required") {
    return result;
  }

  try {
    const usdaCandidates = await searchGenericFoods(query, pageSize);
    const usdaResolution = resolveNamedGenericCandidates(query, usdaCandidates, "USDA FoodData Central");
    return usdaResolution.kind === "unknown" ? result : { ...result, genericResolution: usdaResolution };
  } catch (error) {
    if (error instanceof ProviderError && ["timeout", "provider_unavailable", "rate_limited"].includes(error.kind)) {
      return result;
    }
    throw error;
  }
}