import OpenAI from "openai";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { APPROVED_FEATURE_IDS, approvedFeatureClaimsFor, approvedFeatureManifestForPrompt } from "./feature-manifest";
import {
  selectRotationPackage,
  validateRotationPackage,
  type ContentRotationPackage,
} from "./rotation";
import { CONTENT_DISCLAIMER, validateContent } from "./safety";
import type { ContentPackage } from "./types";
import { DEFAULT_DIABEATS_VIDEO_TEMPLATE } from "./video-template";

const MAX_VISUAL_DESCRIPTION_LENGTH = 180;
const MAX_DRAFT_ATTEMPTS = 3;

function createContentAgentClient() {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Content Agent requires the configured AI integration.");
  return new OpenAI({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

function contentAgentVoice() {
  const voice = process.env.CONTENT_AGENT_VOICE;
  return voice === "alloy" || voice === "echo" || voice === "fable" || voice === "onyx" || voice === "nova" || voice === "shimmer"
    ? voice
    : "alloy";
}

const draftSchema = z.object({
  topic: z.string().min(3).max(100),
  featureIds: z.array(z.enum(APPROVED_FEATURE_IDS)).min(1).max(3).refine((ids) => new Set(ids).size === ids.length, "Feature IDs must be unique"),
  hook: z.string().min(5).max(55),
  voiceover: z.string().min(40).max(900),
  scenes: z.array(z.object({ seconds: z.number().int().min(2).max(8), onScreenText: z.string().max(90), visual: z.string().max(MAX_VISUAL_DESCRIPTION_LENGTH) })).min(3).max(7),
  caption: z.string().min(10).max(1200),
  hashtags: z.array(z.string().regex(/^#[A-Za-z0-9_]+$/)).min(2).max(8),
  callToAction: z.string().min(3).max(160),
}).strict();

function shortenVisualDescription(value: unknown) {
  if (typeof value !== "string" || value.length <= MAX_VISUAL_DESCRIPTION_LENGTH) return value;
  return `${value.slice(0, MAX_VISUAL_DESCRIPTION_LENGTH - 1).trimEnd()}…`;
}

export function parseGeneratedDraft(raw: string) {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { scenes?: unknown }).scenes)) {
    return draftSchema.parse(parsed);
  }

  const normalized = {
    ...parsed,
    scenes: (parsed as { scenes: unknown[] }).scenes.map((scene) => {
      if (!scene || typeof scene !== "object") return scene;
      return { ...scene, visual: shortenVisualDescription((scene as { visual?: unknown }).visual) };
    }),
  };
  return draftSchema.parse(normalized);
}

function createContentPackage(raw: string, rotationPackage: ContentRotationPackage): ContentPackage {
  const draft = parseGeneratedDraft(raw);
  const now = new Date();
  const content: ContentPackage = {
    ...draft,
    featureClaims: approvedFeatureClaimsFor(draft.featureIds),
    id: `${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now.toISOString(),
    status: "draft",
    disclaimer: CONTENT_DISCLAIMER,
    rotationPackageId: rotationPackage.id,
    rotationImageSetId: rotationPackage.imageSetId,
    presentationTemplate: DEFAULT_DIABEATS_VIDEO_TEMPLATE.id,
  };
  const errors = [
    ...validateContent(content),
    ...validateRotationPackage(content, rotationPackage),
  ];
  if (errors.length) throw new Error(`Content safety check failed: ${errors.join("; ")}`);
  return content;
}

export function generationPrompt(
  previousTopics: string[],
  rotationPackageOrRetrying?: ContentRotationPackage | boolean,
  retrying = false,
) {
  // Keep the old (topics, retrying) call shape available to preview tooling and
  // older tests while normal generation supplies a selected rotation package.
  const rotationPackage = typeof rotationPackageOrRetrying === "object" ? rotationPackageOrRetrying : undefined;
  const isRetrying = typeof rotationPackageOrRetrying === "boolean" ? rotationPackageOrRetrying : retrying;
  const retryInstruction = isRetrying
    ? "Your previous draft did not meet the required JSON format or safety rules. Regenerate from scratch and follow every constraint exactly. "
    : "";
  const rotationInstruction = rotationPackage
    ? `
This draft must use the selected content rotation package exactly:
- package ID: ${rotationPackage.id}
- meal concept: ${rotationPackage.mealConcept}
- exact opening hook: ${rotationPackage.hook}
- exact nutrition example: ${rotationPackage.nutritionExample}
- required details to include in the voiceover or scene text: ${rotationPackage.requiredTerms.join(", ")}
Use the exact hook and nutrition numbers above. Do not substitute a different meal, image context, or nutrition example. Keep all numbers explicitly labeled as examples and remind viewers that menus and portions vary.`
    : "";
  return `${retryInstruction}Create one 20-35 second vertical TikTok concept for DiabEats, an app that helps people make more informed restaurant and packaged-food choices. Be warm, useful, specific, and never diagnose, prescribe, promise glucose outcomes, use cure/reversal/guarantee language, claim food is diabetic-safe, or give medication instructions. Encourage verification of restaurant/label nutrition. Avoid these recent topics: ${previousTopics.join(", ") || "none"}.

${rotationInstruction}

The app capabilities you may advertise are restricted to this approved manifest. Select one to three featureIds from it. Do not make any DiabEats capability claim in the hook, voiceover, on-screen text, caption, or CTA; the approved canonical claims are derived separately from selected featureIds. The only permitted model-written brand CTAs are "Explore DiabEats", "Explore more in DiabEats", or "Explore options in DiabEats". Do not paraphrase, imply, or advertise any other DiabEats workflow.
${approvedFeatureManifestForPrompt()}

Never claim portion sliders, pinned meal-specific carb targets, restaurant-PDF opening, glucose prediction, or any unsupported workflow. The hook must be 55 characters or fewer. Return JSON only with topic, featureIds, hook, voiceover, scenes [{seconds,onScreenText,visual}], caption, hashtags, callToAction. Each scene visual must be a concise production note of 180 characters or fewer.`;
}

export async function generateContent(
  previousTopics: string[],
  recentRotationPackageIds: readonly string[] = [],
): Promise<ContentPackage> {
  const client = createContentAgentClient();
  const rotationPackage = selectRotationPackage(recentRotationPackageIds);
  let lastValidationError: unknown;

  for (let attempt = 1; attempt <= MAX_DRAFT_ATTEMPTS; attempt += 1) {
    const response = await client.responses.create({
      model: process.env.CONTENT_AGENT_MODEL || "gpt-5-mini",
      input: generationPrompt(previousTopics, rotationPackage, attempt > 1),
    });
    const raw = response.output_text.replace(/```json\s*|```/g, "").trim();

    try {
      return createContentPackage(raw, rotationPackage);
    } catch (error) {
      lastValidationError = error;
    }
  }

  const detail = lastValidationError instanceof Error ? lastValidationError.message : "Unknown draft validation failure";
  throw new Error(`Content generation failed after ${MAX_DRAFT_ATTEMPTS} attempts: ${detail}`);
}

export async function createVoiceover(text: string, destination: string) {
  const client = createContentAgentClient();
  const response = await client.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice: contentAgentVoice(), format: "mp3" },
    messages: [
      { role: "system", content: "You are a clear, warm narrator. Repeat the provided script verbatim." },
      { role: "user", content: text },
    ],
  });
  const audioData = (response.choices[0]?.message as { audio?: { data?: string } } | undefined)?.audio?.data;
  if (!audioData) throw new Error("Content Agent speech generation returned no audio.");
  await writeFile(destination, Buffer.from(audioData, "base64"));
}
