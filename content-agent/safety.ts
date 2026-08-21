import { containsUnsafeMedicalAdvice } from "../shared/ai-safety";
import { validateFeatureClaims } from "./feature-manifest";
import type { ContentPackage } from "./types";

export const CONTENT_DISCLAIMER = "General education only - not medical advice.";

const prohibited = [
  /cure(?:s|d)? diabetes/i,
  /reverse(?:s|d)? diabetes/i,
  /guaranteed/i,
  /no (?:glucose|blood sugar) spike/i,
  /diabetic[- ]safe/i,
  /stop (?:taking )?(?:insulin|medication)/i,
];

export function validateContent(content: ContentPackage): string[] {
  const text = [content.hook, content.voiceover, ...content.scenes.map((scene) => scene.onScreenText), content.caption, content.callToAction].join(" ");
  const errors: string[] = [];
  if (containsUnsafeMedicalAdvice(text)) errors.push("Contains individualized or certain medical advice");
  for (const pattern of prohibited) if (pattern.test(text)) errors.push(`Prohibited claim: ${pattern.source}`);
  errors.push(...validateFeatureClaims(content.featureIds, content.featureClaims, text));
  if (content.voiceover.length > 900) errors.push("Voiceover is too long for a short video");
  if (content.scenes.length < 3 || content.scenes.length > 7) errors.push("Use 3â€“7 scenes");
  if (content.disclaimer !== CONTENT_DISCLAIMER) errors.push("Use the required medical disclaimer");
  if (content.hashtags.length > 8) errors.push("Use no more than eight hashtags");
  return errors;
}
