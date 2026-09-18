import type { NormalizedProduct } from "./biotrace";
import { computeBioTraceRating, type BioTraceRating } from "./biotrace-rating";

export type NeutralBioTraceHistorySnapshot = {
  product: NormalizedProduct;
  rating: BioTraceRating;
};

/**
 * Local and server history snapshots must not retain profile-derived factors.
 * The current profile is applied transiently when history is displayed.
 */
export function neutralBioTraceHistorySnapshot(
  result: { product: NormalizedProduct; rating?: BioTraceRating },
): NeutralBioTraceHistorySnapshot {
  return {
    product: result.product,
    rating: computeBioTraceRating(result.product),
  };
}