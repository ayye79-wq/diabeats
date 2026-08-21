import type { ApprovedFeatureClaim, ApprovedFeatureId } from "./feature-manifest";

export type ContentStatus = "draft" | "approved" | "published" | "rejected";

export interface ContentPackage {
  id: string;
  createdAt: string;
  status: ContentStatus;
  topic: string;
  featureIds: ApprovedFeatureId[];
  featureClaims: ApprovedFeatureClaim[];
  hook: string;
  voiceover: string;
  scenes: Array<{ seconds: number; onScreenText: string; visual: string }>;
  caption: string;
  hashtags: string[];
  disclaimer: string;
  callToAction: string;
  videoPath?: string;
  publishId?: string;
}
