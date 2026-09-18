import path from "node:path";

export type DiabEatsVideoTemplate = {
  id: string;
  displayName: string;
  assetPath?: string;
  assetPaths?: string[];
  logoPath?: string;
  colors: {
    ink: string;
    surface: string;
    accent: string;
    accentSoft: string;
    text: string;
    mutedText: string;
  };
  transitionSeconds: number;
  finalCallToAction: string;
  backgroundOverlayOpacity?: number;
  lowerOverlayOpacity?: number;
  headerCardOpacity?: number;
  textCardOpacity?: number;
  finalInnerCardOpacity?: number;
};

/**
 * Presentation-only settings for promotional video renders. Keep content,
 * approvals, and publishing outside this module so visual refinements do not
 * affect the Content Agent workflow.
 */
export const DIABEATS_SOCIAL_V2: DiabEatsVideoTemplate = {
  id: "diabeats-social-v2",
  displayName: "DiabEats Social V2",
  assetPath: path.resolve(process.cwd(), "content-agent/assets/diabeats-restaurant-meals-v2.jpg"),
  colors: {
    ink: "0x061B25",
    surface: "0x0B2733",
    accent: "0x4ED7B1",
    accentSoft: "0xBCEBDD",
    text: "0xFFFFFF",
    mutedText: "0xD4E8E3",
  },
  transitionSeconds: 0.45,
  finalCallToAction: "Check your meal with DiabEats.",
};

export const DIABEATS_SOCIAL_V3: DiabEatsVideoTemplate = {
  id: "diabeats-social-v3",
  displayName: "DiabEats Social V3",
  assetPaths: [
    path.resolve(process.cwd(), "attached_assets/generated_images/diabeats-v3-meal-comparison.jpg"),
    path.resolve(process.cwd(), "attached_assets/generated_images/diabeats-v3-high-carb-meal.jpg"),
    path.resolve(process.cwd(), "attached_assets/generated_images/diabeats-v3-alternative-meal.jpg"),
    path.resolve(process.cwd(), "attached_assets/generated_images/diabeats-v3-menu-context.jpg"),
  ],
  colors: {
    ink: "0x061B25",
    surface: "0x0B2733",
    accent: "0x4ED7B1",
    accentSoft: "0xBCEBDD",
    text: "0xFFFFFF",
    mutedText: "0xE4F5F0",
  },
  transitionSeconds: 0.24,
  finalCallToAction: "Check your meal with DiabEats.",
};

export const DIABEATS_SOCIAL_V4: DiabEatsVideoTemplate = {
  id: "diabeats-social-v4",
  displayName: "DiabEats Social V4",
  logoPath: path.resolve(process.cwd(), "content-agent/assets/diabeats-logo-transparent.png"),
  assetPaths: [
    path.resolve(process.cwd(), "attached_assets/generated_images/diabeats-v3-meal-comparison.jpg"),
    path.resolve(process.cwd(), "attached_assets/generated_images/diabeats-v3-high-carb-meal.jpg"),
    path.resolve(process.cwd(), "attached_assets/generated_images/diabeats-v3-alternative-meal.jpg"),
    path.resolve(process.cwd(), "attached_assets/generated_images/diabeats-v4-menu-context.jpg"),
  ],
  colors: {
    ink: "0x061B25",
    surface: "0x0B2733",
    accent: "0x4ED7B1",
    accentSoft: "0xBCEBDD",
    text: "0xFFFFFF",
    mutedText: "0xF0FFFB",
  },
  transitionSeconds: 0.24,
  finalCallToAction: "Check your meal with DiabEats.",
  backgroundOverlayOpacity: 0.05,
  lowerOverlayOpacity: 0.08,
  headerCardOpacity: 0.46,
  textCardOpacity: 0.7,
  finalInnerCardOpacity: 0.74,
};

/** Default for generated Content Agent videos. Legacy templates remain opt-in. */
export const DEFAULT_DIABEATS_VIDEO_TEMPLATE = DIABEATS_SOCIAL_V4;