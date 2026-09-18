import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createVoiceover } from "./generator";
import { approvedFeatureClaimsFor } from "./feature-manifest";
import { validateContent } from "./safety";
import type { ContentPackage } from "./types";
import { DIABEATS_SOCIAL_V4 } from "./video-template";
import { renderBrowserPreview, renderVerticalVideo } from "./video";

const contentRoot = path.resolve(process.cwd(), "content-agent");
const previewId = "diabeats-promo-v4-preview";
const previewPath = path.join(contentRoot, "review-drafts", `${previewId}.mp4`);
const browserPreviewPath = path.join(contentRoot, "review-drafts", `${previewId}.webm`);
const previewPackagePath = path.join(contentRoot, "review-drafts", `${previewId}.json`);

async function main() {
  const preview: ContentPackage & { presentationTemplate: string } = {
    id: previewId,
    createdAt: new Date().toISOString(),
    status: "draft",
    topic: "A quick nutrition comparison before you order",
    featureIds: ["menu-item-information", "meal-comparison"],
    featureClaims: approvedFeatureClaimsFor(["menu-item-information", "meal-comparison"]),
    hook: "Before you order, compare this first",
    voiceover: "Before you order, compare this first. In this example, a burger, fries, and soda total 96 grams of carbs and 24 grams of protein. A grilled chicken salad with water has 28 grams of carbs and 35 grams of protein. Menus vary, so check the actual details.",
    scenes: [
      { seconds: 4, onScreenText: "Before you order, compare this first", visual: "A high-carb classic beside an alternative meal." },
      { seconds: 4, onScreenText: "HIGH-CARB CLASSIC\nBurger + fries + soda\nExample: 96g carbs / 24g protein", visual: "A recognizable burger, fries, and sugary soda." },
      { seconds: 4, onScreenText: "LOWER-CARB OPTION\nChicken salad + water\nExample: 28g carbs / 35g protein", visual: "A grilled chicken salad with water." },
      { seconds: 4, onScreenText: "Check serving size and menu details", visual: "A restaurant menu beside both meal options." },
    ],
    caption: "Example comparison only: restaurant meals and portions vary. Check the actual menu details before you order.",
    hashtags: ["#DiabEats", "#EatingOut", "#NutritionEducation", "#MealComparison"],
    disclaimer: "General education only - not medical advice.",
    callToAction: "Explore DiabEats",
    presentationTemplate: DIABEATS_SOCIAL_V4.id,
  };
  const errors = validateContent(preview);
  if (errors.length) throw new Error(`Preview content did not pass safety validation: ${errors.join("; ")}`);

  const audioPath = path.join(os.tmpdir(), `${previewId}.mp3`);
  try {
    await createVoiceover(preview.voiceover, audioPath);
    await renderVerticalVideo(audioPath, previewPath, preview, { template: DIABEATS_SOCIAL_V4 });
    await renderBrowserPreview(previewPath, browserPreviewPath);
    await writeFile(previewPackagePath, JSON.stringify(preview, null, 2));
  } finally {
    await unlink(audioPath).catch(() => undefined);
  }
  console.log(JSON.stringify({
    id: preview.id,
    status: preview.status,
    template: preview.presentationTemplate,
    videoPath: previewPath,
    browserPreviewPath,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});