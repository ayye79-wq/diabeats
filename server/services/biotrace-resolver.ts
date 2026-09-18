import {
  ProviderError,
  normalizedProductSchema,
  type IdentifierEvidenceType,
  type NormalizedProduct,
  type ProductResolution,
} from "../../shared/biotrace";

export const PRODUCT_CACHE_FRESH_MS = 24 * 60 * 60 * 1_000;
export const PRODUCT_CACHE_STALE_IF_ERROR_MS = 7 * 24 * 60 * 60 * 1_000;

export type CachedProduct = {
  product: NormalizedProduct;
  fetchedAt: Date;
};

export type ProductCache = {
  read(barcode: string): Promise<CachedProduct | null>;
  write(product: NormalizedProduct): Promise<void>;
};

export type ProductLookup = (barcode: string) => Promise<NormalizedProduct>;

const inFlightLookups = new WeakMap<ProductLookup, Map<string, Promise<NormalizedProduct>>>();

function deduplicatedLookup(lookup: ProductLookup, barcode: string): Promise<NormalizedProduct> {
  let byBarcode = inFlightLookups.get(lookup);
  if (!byBarcode) {
    byBarcode = new Map();
    inFlightLookups.set(lookup, byBarcode);
  }
  const existing = byBarcode.get(barcode);
  if (existing) return existing;
  const pending = lookup(barcode).finally(() => byBarcode?.delete(barcode));
  byBarcode.set(barcode, pending);
  return pending;
}

export type UnknownIdentifierResult = {
  kind: "unknown";
  identifier: string;
  resolution: ProductResolution;
  recoveryActions: readonly ["search-by-name", "label-photo", "manual-entry"];
};

export function buildUnknownIdentifierResult(
  identifier: string,
  evidenceType: "gtin" | "human-readable-plu" | "unknown" = "gtin",
): UnknownIdentifierResult {
  return {
    kind: "unknown",
    identifier,
    resolution: {
      kind: evidenceType === "human-readable-plu" ? "confirmation-required" : "unknown",
      evidenceType,
      confidence: evidenceType === "human-readable-plu" ? "user-supplied" : "unknown",
      confirmationRequired: true,
      explanation:
        evidenceType === "human-readable-plu"
          ? "This may be a human-readable PLU, but BioTrace has no approved PLU data source to identify it."
          : "No approved provider returned a product for this identifier. BioTrace did not guess a food.",
    },
    recoveryActions: ["search-by-name", "label-photo", "manual-entry"],
  };
}

function exactResolution(
  evidenceType: IdentifierEvidenceType,
  provider: NormalizedProduct["source"]["provider"] = "open-food-facts",
): ProductResolution {
  return {
    kind: "exact",
    evidenceType,
    confidence: "provider-confirmed",
    confirmationRequired: false,
    explanation:
      provider === "usda-fooddata-central"
        ? "USDA FoodData Central returned a branded food record matching this exact GTIN."
        : "Open Food Facts returned a product record for this exact GTIN.",
  };
}

export function withProductResolution(
  product: NormalizedProduct,
  resolution: ProductResolution,
  freshness: NormalizedProduct["source"]["freshness"] = "live",
): NormalizedProduct {
  return {
    ...product,
    source: { ...product.source, freshness },
    resolution,
  };
}

function validCachedProduct(value: unknown): NormalizedProduct | null {
  const parsed = normalizedProductSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function resolveBarcodeProduct(input: {
  barcode: string;
  evidenceType?: Extract<IdentifierEvidenceType, "gtin" | "gs1-gtin" | "retailer-specific-produce-id" | "branded-produce-sticker">;
  cache: ProductCache;
  lookup: ProductLookup;
  now?: Date;
}): Promise<NormalizedProduct> {
  const now = input.now ?? new Date();
  const evidenceType = input.evidenceType ?? "gtin";
  let cached: CachedProduct | null = null;

  try {
    cached = await input.cache.read(input.barcode);
  } catch (error) {
    console.error("BioTrace product cache read failed:", error);
  }

  if (cached) {
    const product = validCachedProduct(cached.product);
    const age = now.getTime() - cached.fetchedAt.getTime();
    if (product && age >= 0 && age <= PRODUCT_CACHE_FRESH_MS && product.source.provider === "open-food-facts") {
      return withProductResolution(product, exactResolution(evidenceType, product.source.provider), "fresh-cache");
    }
  }

  try {
    const resolved = await deduplicatedLookup(input.lookup, input.barcode);
    const live = withProductResolution(resolved, exactResolution(evidenceType, resolved.source.provider), "live");
    try {
      await input.cache.write(live);
    } catch (error) {
      console.error("BioTrace product cache write failed:", error);
    }
    return live;
  } catch (error) {
    if (
      cached &&
      error instanceof ProviderError &&
      ["timeout", "provider_unavailable", "rate_limited"].includes(error.kind)
    ) {
      const product = validCachedProduct(cached.product);
      const age = now.getTime() - cached.fetchedAt.getTime();
      if (product && age >= 0 && age <= PRODUCT_CACHE_STALE_IF_ERROR_MS) {
        return withProductResolution(product, exactResolution(evidenceType, product.source.provider), "stale-cache");
      }
    }
    throw error;
  }
}

export type GenericCandidateResolution =
  | { kind: "generic"; product: NormalizedProduct }
  | { kind: "confirmation-required"; candidateNames: string[]; reason: string }
  | { kind: "unknown" };

function materialProductKey(product: NormalizedProduct): string {
  return JSON.stringify({
    name: product.name.trim().toLowerCase(),
    brand: product.brand?.trim().toLowerCase() ?? null,
    nutrition: product.nutrition,
  });
}

export function resolveGenericCandidates(query: string, candidates: NormalizedProduct[]): GenericCandidateResolution {
  return resolveGenericCandidatesWithMatch(query, candidates, "Open Food Facts", (candidateName, normalizedQuery) => candidateName === normalizedQuery);
}

function resolveGenericCandidatesWithMatch(
  query: string,
  candidates: NormalizedProduct[],
  providerLabel: string,
  matches: (candidateName: string, normalizedQuery: string) => boolean,
): GenericCandidateResolution {
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/gu, " ");
  const exactNameCandidates = candidates.filter(
    (candidate) => matches(candidate.name.trim().toLowerCase().replace(/\s+/gu, " "), normalizedQuery),
  );
  if (exactNameCandidates.length === 0) return { kind: "unknown" };

  const materiallyDistinct = new Map(exactNameCandidates.map((candidate) => [materialProductKey(candidate), candidate]));
  if (materiallyDistinct.size > 1) {
    return {
      kind: "confirmation-required",
      candidateNames: [...new Set(exactNameCandidates.map((candidate) => candidate.name))].slice(0, 5),
       reason: `${providerLabel} returned conflicting matching records. Confirm the food or label before using nutrition values.`,
    };
  }

  const candidate = [...materiallyDistinct.values()][0];
  return {
    kind: "generic",
    product: withProductResolution(
      { ...candidate, barcode: null },
      {
        kind: "generic",
        evidenceType: "provider-name-match",
        confidence: "provider-supported",
        confirmationRequired: true,
         explanation: `${providerLabel} returned one consistent name match. Confirm that it matches your food and portion.`,
      },
      "live",
    ),
  };
}

/**
 * USDA descriptions are often more specific than a user's common name
 * ("Onions, yellow, raw" versus "yellow onion"). Matching is still strict:
 * every query token must occur in the provider name, and multiple materially
 * different records remain confirmation-required rather than guessed.
 */
export function resolveNamedGenericCandidates(
  query: string,
  candidates: NormalizedProduct[],
  providerLabel: string,
): GenericCandidateResolution {
  const words = (value: string) =>
    value
      .match(/[\p{L}\p{N}]+/gu)
      ?.map((token) => {
        const normalized = token.toLowerCase();
        return normalized.length > 3 && normalized.endsWith("s") && !normalized.endsWith("ss")
          ? normalized.slice(0, -1)
          : normalized;
      }) ?? [];
  return resolveGenericCandidatesWithMatch(
    query,
    candidates,
    providerLabel,
    (candidateName, normalizedQuery) => {
      const candidateTokens = new Set(words(candidateName));
      const queryTokens = words(normalizedQuery);
      return queryTokens.length > 0 && queryTokens.every((token) => candidateTokens.has(token));
    },
  );
}