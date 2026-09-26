import type { NormalizedProduct } from "../../shared/biotrace";

type ProductResolution = {
  kind: "generic";
  evidenceType: "provider-name-match";
  confidence: "provider-supported";
  confirmationRequired: true;
  explanation: string;
};

export type ResolvedGenericProduct = NormalizedProduct & { resolution: ProductResolution };

export type GenericCandidateResolution =
  | { kind: "generic"; product: ResolvedGenericProduct }
  | { kind: "confirmation-required"; candidateNames: string[]; reason: string }
  | { kind: "unknown" };

function words(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+/gu)?.map((token) => {
    const normalized = token.toLowerCase();
    return normalized.length > 3 && normalized.endsWith("s") && !normalized.endsWith("ss")
      ? normalized.slice(0, -1)
      : normalized;
  }) ?? [];
}

function materialKey(product: NormalizedProduct): string {
  return JSON.stringify({
    name: product.name.trim().toLowerCase(),
    brand: product.brand?.trim().toLowerCase() ?? null,
    nutrition: product.nutrition,
  });
}

/**
 * USDA descriptions often include preparation terms absent from a search
 * phrase. Require every query token to occur in the provider description;
 * when distinct records qualify, require confirmation instead of choosing.
 */
export function resolveNamedGenericCandidates(
  query: string,
  candidates: NormalizedProduct[],
  providerLabel: string,
): GenericCandidateResolution {
  const queryTokens = words(query.trim().toLowerCase());
  if (queryTokens.length === 0) return { kind: "unknown" };
  const matches = candidates.filter((candidate) => {
    const candidateTokens = new Set(words(candidate.name));
    return queryTokens.every((token) => candidateTokens.has(token));
  });
  if (matches.length === 0) return { kind: "unknown" };

  const distinct = new Map(matches.map((candidate) => [materialKey(candidate), candidate]));
  if (distinct.size > 1) {
    return {
      kind: "confirmation-required",
      candidateNames: [...new Set(matches.map((candidate) => candidate.name))].slice(0, 5),
      reason: `${providerLabel} returned conflicting matching records. Confirm the food or label before using nutrition values.`,
    };
  }

  const [candidate] = distinct.values();
  return {
    kind: "generic",
    product: {
      ...candidate,
      barcode: null,
      resolution: {
        kind: "generic",
        evidenceType: "provider-name-match",
        confidence: "provider-supported",
        confirmationRequired: true,
        explanation: `${providerLabel} returned one consistent name match. Confirm that it matches your food and portion.`,
      },
    },
  };
}