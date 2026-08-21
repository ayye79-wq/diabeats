/**
 * The only DiabEats product capabilities that Content Agent copy may advertise.
 * Each entry is verified against the evidence paths before being added here.
 */
export const APPROVED_FEATURE_IDS = [
  "barcode-product-scanning",
  "menu-item-information",
  "saved-foods-and-favorites",
  "meal-logging-with-notes",
  "daily-carb-target-preferences",
  "meal-comparison",
  "biotrace-results",
  "data-sources-and-methodology",
] as const;

export type ApprovedFeatureId = (typeof APPROVED_FEATURE_IDS)[number];

export interface ApprovedFeature {
  id: ApprovedFeatureId;
  claim: string;
  evidence: readonly string[];
}

export interface ApprovedFeatureClaim {
  featureId: ApprovedFeatureId;
  claim: string;
}

export const APPROVED_FEATURES: readonly ApprovedFeature[] = [
  {
    id: "barcode-product-scanning",
    claim: "Scan a packaged product barcode to look up product information.",
    evidence: ["app/(tabs)/biotrace.tsx", "app/(tabs)/scan-hub.tsx", "server/routes.ts"],
  },
  {
    id: "menu-item-information",
    claim: "View restaurant menu-item details and nutrition information.",
    evidence: ["app/meal/[restaurantId]/[itemId].tsx", "app/(tabs)/scan.tsx"],
  },
  {
    id: "saved-foods-and-favorites",
    claim: "Save foods and favorite restaurant meals for later.",
    evidence: ["app/(tabs)/biotrace.tsx", "app/(tabs)/saved.tsx", "app/meal/[restaurantId]/[itemId].tsx"],
  },
  {
    id: "meal-logging-with-notes",
    claim: "Log a meal and optionally add a blood sugar note.",
    evidence: ["app/meal/[restaurantId]/[itemId].tsx", "app/(tabs)/saved.tsx"],
  },
  {
    id: "daily-carb-target-preferences",
    claim: "Set a daily carbohydrate target preference.",
    evidence: ["app/(tabs)/profile.tsx"],
  },
  {
    id: "meal-comparison",
    claim: "Compare restaurant meals using the available meal comparison tools.",
    evidence: ["app/compare.tsx", "app/meal-simulator.tsx", "components/SimulatorModal.tsx"],
  },
  {
    id: "biotrace-results",
    claim: "View BioTrace product results, including ratings and label details.",
    evidence: ["app/(tabs)/biotrace.tsx", "components/BioTraceResult.tsx", "shared/biotrace-rating.ts"],
  },
  {
    id: "data-sources-and-methodology",
    claim: "View displayed data-source and methodology links.",
    evidence: ["components/BioTraceResult.tsx", "app/(tabs)/profile.tsx", "app/report.tsx", "app/ai-menu/[name].tsx"],
  },
];

const unsupportedFeatureClaims = [
  { label: "portion sliders", pattern: /\bportion[- ]?sliders?\b|\b(?:portion|serving)(?:\s+\w+){0,4}\s+(?:slider|adjust(?:ment)?|control)\b/i },
  { label: "pinned meal-specific carb targets", pattern: /\b(?:pin(?:ned)?\s+)?meal[- ]specific carb(?:ohydrate)? targets?\b|\bpin(?:ned)? carb(?:ohydrate)? targets?\b|\bset(?:ting)? (?:a )?(?:meal|lunch|dinner|breakfast)(?:\s+\w+){0,4}\s+carb(?:ohydrate)? (?:goal|target)\b|\b(?:set|choose|pin)(?:\s+\w+){0,4}\s+(?:each|per)\s+(?:meal|lunch|dinner|breakfast)(?:\s+\w+){0,4}\s+carb(?:ohydrate)? (?:goal|target)\b|\bset(?:ting)? (?:a )?carb(?:ohydrate)? (?:goal|target)(?:\s+\w+){0,4}\s+(?:each|per)\s+(?:meal|lunch|dinner|breakfast)\b/i },
  { label: "restaurant PDF opening", pattern: /\b(?:open|opening|opens?|view|download|access|read)(?:\s+\w+){0,5}\s+(?:restaurant(?:\s+menu)?|menu)(?:\s+\w+){0,2}\s+(?:pdf|document|file)\b|\brestaurant[- ]pdfs?\b/i },
  { label: "glucose prediction", pattern: /\b(?:glucose|blood sugar) (?:prediction|predictor)\b|\b(?:predict|forecast|estimate)(?:s|ing)? (?:your )?(?:glucose|blood sugar)\b/i },
] as const;

const genericBrandCtas = [
  /^explore (?:more |options )?in diabeats$/i,
  /^explore diabeats$/i,
] as const;

const genericAppCapabilityPattern = /\b(?:this|the|our)\s+(?:app|platform|tool)\s+(?:lets?|allows?|offers?|has|can|helps?|provides?|supports?|includes?|features?)\b/i;

export function isApprovedFeatureId(value: string): value is ApprovedFeatureId {
  return (APPROVED_FEATURE_IDS as readonly string[]).includes(value);
}

export function approvedFeatureClaimsFor(featureIds: readonly ApprovedFeatureId[]): ApprovedFeatureClaim[] {
  return featureIds.map((featureId) => {
    const feature = APPROVED_FEATURES.find((candidate) => candidate.id === featureId);
    if (!feature) throw new Error(`Unsupported approved feature: ${featureId}`);
    return { featureId, claim: feature.claim };
  });
}

export function validateFeatureClaims(
  featureIds: readonly string[],
  featureClaims: readonly ApprovedFeatureClaim[],
  text: string,
) {
  const errors: string[] = [];
  if (!featureIds.length) errors.push("Select at least one approved feature");
  if (new Set(featureIds).size !== featureIds.length) errors.push("Do not repeat approved features");
  for (const featureId of featureIds) {
    if (!isApprovedFeatureId(featureId)) errors.push(`Unsupported feature claim: ${featureId}`);
  }
  const validIds = featureIds.filter(isApprovedFeatureId);
  const expectedClaims = approvedFeatureClaimsFor(validIds);
  if (featureClaims.length !== expectedClaims.length) errors.push("Feature claims must match selected approved features");
  for (const expected of expectedClaims) {
    const actual = featureClaims.find((claim) => claim.featureId === expected.featureId);
    if (!actual || actual.claim !== expected.claim) {
      errors.push(`Feature claim must use approved manifest copy: ${expected.featureId}`);
    }
  }
  const sentences = text.split(/[.!?\n]+/).map((sentence) => sentence.trim()).filter(Boolean);
  const hasFreeFormBrandClaim = sentences.some((sentence) =>
    /\bdiabeats\b/i.test(sentence) && !genericBrandCtas.some((template) => template.test(sentence)));
  if (hasFreeFormBrandClaim || genericAppCapabilityPattern.test(text)) {
    errors.push("Use manifest-derived feature claims instead of free-form DiabEats capability copy");
  }
  for (const rule of unsupportedFeatureClaims) {
    if (rule.pattern.test(text)) errors.push(`Unsupported feature claim: ${rule.label}`);
  }
  return errors;
}

export function approvedFeatureManifestForPrompt() {
  return APPROVED_FEATURES.map((feature) => `- ${feature.id}: ${feature.claim}`).join("\n");
}