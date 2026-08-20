import type { NormalizedProduct } from "../../shared/biotrace";
import { ProviderError } from "../../shared/biotrace";
import { computeBioTraceRating, type BioTraceRating } from "../../shared/biotrace-rating";
import { normalizeProduct } from "./open-food-facts";

/**
 * Deterministic alternative ranking for BioTrace.
 *
 * Given a normalized product, finds other products in the same OFF category
 * and ranks them by their deterministic BioTrace score (higher = better fit),
 * with stable tie-breakers so the same inputs always produce the same order.
 * No values are invented — every candidate is normalized from the provider.
 */

const OFF_BASE = "https://world.openfoodfacts.org";
const REQUEST_TIMEOUT_MS = 8_000;
const USER_AGENT = "DiabEats-BioTrace/1.0 (server-side; contact via app support)";

const ALT_FIELDS = [
  "code",
  "product_name",
  "brands",
  "quantity",
  "categories_tags",
  "image_front_url",
  "ingredients_text",
  "ingredients_analysis_tags",
  "additives_tags",
  "labels_tags",
  "nova_group",
  "nutriscore_grade",
  "nutriments",
  "serving_size",
  "serving_quantity",
  "completeness",
].join(",");

export type Alternative = { product: NormalizedProduct; rating: BioTraceRating };

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

/** Picks the most specific category to search within, as a plain slug. */
function chooseCategory(product: NormalizedProduct): string | null {
  // Normalized categories are ordered from broad to specific; the last is the
  // most specific. Convert back to an OFF-friendly slug.
  if (product.categories.length > 0) {
    return product.categories[product.categories.length - 1].trim().replace(/\s+/gu, "-").toLowerCase();
  }
  return null;
}

/**
 * Fetches and ranks up to `limit` alternatives that rate strictly better than
 * to the source product. Returns an empty array when no category is known.
 */
export async function findAlternatives(
  product: NormalizedProduct,
  limit = 5,
): Promise<Alternative[]> {
  const category = chooseCategory(product);
  if (!category) return [];

  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 10);

  const params = new URLSearchParams({
    action: "process",
    tagtype_0: "categories",
    tag_contains_0: "contains",
    tag_0: category,
    sort_by: "nutriscore_score",
    page_size: "40",
    fields: ALT_FIELDS,
    json: "1",
  });
  const url = `${OFF_BASE}/cgi/search.pl?${params.toString()}`;

  let json: Record<string, unknown> = {};
  try {
    const raw = await offFetch(url);
    json = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  } catch (error) {
    // Alternatives are best-effort: on provider issues, return none rather than
    // failing the whole request. Barcode lookups remain the source of truth.
    if (error instanceof ProviderError && (error.kind === "timeout" || error.kind === "provider_unavailable" || error.kind === "rate_limited")) {
      return [];
    }
    throw error;
  }

  const productsRaw = Array.isArray(json["products"]) ? (json["products"] as unknown[]) : [];
  const sourceScore = computeBioTraceRating(product).score;
  const seen = new Set<string>();
  if (product.barcode) seen.add(product.barcode);

  const candidates: Alternative[] = [];
  for (const entry of productsRaw) {
    const candidate = normalizeProduct(entry, null);
    // Skip the same product and anything without a name/barcode identity.
    const key = candidate.barcode ?? candidate.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const rating = computeBioTraceRating(candidate);
    if (rating.label === "insufficient-information") continue;
    if (rating.score <= sourceScore) continue;

    candidates.push({ product: candidate, rating });
  }

  // Deterministic ranking: score desc, then Nutri-Score asc (a<e), then NOVA
  // asc, then name asc, then barcode asc. Every tie-breaker is stable.
  const nutriRank = (grade: string | null): number => (grade ? grade.charCodeAt(0) : 999);

  candidates.sort((a, b) => {
    if (b.rating.score !== a.rating.score) return b.rating.score - a.rating.score;
    const nutriDiff = nutriRank(a.product.nutriScore) - nutriRank(b.product.nutriScore);
    if (nutriDiff !== 0) return nutriDiff;
    const novaA = a.product.novaGroup ?? 99;
    const novaB = b.product.novaGroup ?? 99;
    if (novaA !== novaB) return novaA - novaB;
    const nameCmp = a.product.name.localeCompare(b.product.name);
    if (nameCmp !== 0) return nameCmp;
    return (a.product.barcode ?? "").localeCompare(b.product.barcode ?? "");
  });

  return candidates.slice(0, safeLimit);
}
