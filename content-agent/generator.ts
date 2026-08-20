import OpenAI from "openai";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { CONTENT_DISCLAIMER, validateContent } from "./safety";
import type { ContentPackage } from "./types";

const draftSchema = z.object({
  topic: z.string().min(3).max(100),
  hook: z.string().min(5).max(150),
  voiceover: z.string().min(40).max(900),
  scenes: z.array(z.object({ seconds: z.number().int().min(2).max(8), onScreenText: z.string().max(90), visual: z.string().max(180) })).min(3).max(7),
  caption: z.string().min(10).max(1200),
  hashtags: z.array(z.string().regex(/^#[A-Za-z0-9_]+$/)).min(2).max(8),
  callToAction: z.string().min(3).max(160),
}).strict();

export async function generateContent(previousTopics: string[]): Promise<ContentPackage> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.CONTENT_AGENT_MODEL || "gpt-5-mini",
    input: `Create one 20â€“35 second vertical TikTok concept for DiabEats, an app that helps people make more informed restaurant and packaged-food choices. Be warm, useful, specific, and never diagnose, prescribe, promise glucose outcomes, or call food diabetic-safe. Encourage verification of restaurant/label nutrition. Avoid these recent topics: ${previousTopics.join(", ") || "none"}. Return JSON only with topic, hook, voiceover, scenes [{seconds,onScreenText,visual}], caption, hashtags, callToAction.`,
  });
  const raw = response.output_text.replace(/```json\s*|```/g, "").trim();
  const draft = draftSchema.parse(JSON.parse(raw));
  const now = new Date();
  const content: ContentPackage = {
    ...draft,
    id: `${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now.toISOString(),
    status: "draft",
    disclaimer: CONTENT_DISCLAIMER,
  };
  const errors = validateContent(content);
  if (errors.length) throw new Error(`Content safety check failed: ${errors.join("; ")}`);
  return content;
}

export async function createVoiceover(text: string, destination: string) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY });
  const audio = await client.audio.speech.create({ model: "gpt-4o-mini-tts", voice: process.env.CONTENT_AGENT_VOICE || "coral", input: text });
  await writeFile(destination, Buffer.from(await audio.arrayBuffer()));
}
