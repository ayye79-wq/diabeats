import { z } from "zod";

export const AI_DISCLAIMER =
  "Educational guidance only—not medical advice. Food, portions, medications, activity, and your body can change glucose responses. Verify nutrition with the restaurant or label and use your care plan for personal decisions.";

export const AI_VERIFICATION =
  "Verify ingredients, portions, and nutrition with the restaurant, package label, or a qualified clinician before relying on this guidance.";

const shortText = (max: number) => z.string().trim().min(1).max(max);
const score = z.enum(["good", "caution", "avoid"]);
const confidence = z.enum(["low", "medium", "high"]);
const impactLevel = z.enum(["low", "moderate", "high"]);

export const evidenceSchema = z.object({
  source: shortText(120),
  basis: shortText(280),
  verified: z.boolean(),
  checkedAt: z.string().datetime(),
}).strict();

export const mealAnalysisSchema = z.object({
  headline: shortText(180),
  bloodSugarImpact: shortText(160),
  glycemicExplanation: shortText(900),
  positives: z.array(shortText(160)).max(3),
  concerns: z.array(shortText(160)).max(3),
  orderingTips: z.array(shortText(180)).min(1).max(3),
  betterAlternative: shortText(220).nullable(),
  confidence,
  informationUsed: z.array(shortText(220)).min(1).max(8),
  limitations: shortText(420),
  verification: shortText(320),
  evidence: evidenceSchema,
}).strict();

export const simulationResultSchema = z.object({
  impactLevel,
  confidence,
  reasoning: shortText(900),
  betterOption: shortText(220).nullable(),
  informationUsed: z.array(shortText(220)).min(1).max(10),
  limitations: shortText(420),
  verification: shortText(320),
  evidence: evidenceSchema,
}).strict();

const scanItemSchema = z.object({
  name: shortText(160),
  description: shortText(360),
  diabeticScore: score,
  carbRange: shortText(80),
  quickTip: shortText(220),
}).strict();

export const scanResultSchema = z.object({
  restaurantType: shortText(100),
  summary: shortText(600),
  items: z.array(scanItemSchema).max(40),
  informationUsed: z.array(shortText(220)).min(1).max(5),
  limitations: shortText(420),
  verification: shortText(320),
  evidence: evidenceSchema,
}).strict();

const aiMenuItemSchema = z.object({
  name: shortText(160),
  category: shortText(80),
  rating: score,
  reason: shortText(300),
  carbs: z.number().finite().min(0).max(300),
  calories: z.number().finite().min(0).max(3000),
  protein: z.number().finite().min(0).max(300),
  tip: shortText(220),
}).strict();

export const aiMenuResultSchema = z.object({
  restaurantName: shortText(160),
  items: z.array(aiMenuItemSchema).max(25),
  informationUsed: z.array(shortText(220)).min(1).max(5),
  limitations: shortText(420),
  verification: shortText(320),
  evidence: evidenceSchema,
}).strict();

export const bestMealResultSchema = z.object({
  recommendedMeal: shortText(160),
  reason: shortText(420),
  bloodSugarImpact: z.enum(["good", "caution"]),
  estimatedCarbs: shortText(80),
  tips: z.array(shortText(180)).min(1).max(3),
  modification: shortText(220).nullable(),
  confidence,
  informationUsed: z.array(shortText(220)).min(1).max(8),
  limitations: shortText(420),
  verification: shortText(320),
  evidence: evidenceSchema,
}).strict();

export const chatEventSchema = z.object({
  content: shortText(4000).optional(),
  error: shortText(300).optional(),
  urgent: z.boolean().optional(),
}).strict().refine((event) => Boolean(event.content || event.error), "Chat event must contain content or error");

export function safeParseAiJson<T>(schema: z.ZodType<T>, raw: string): T {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const parsed: unknown = JSON.parse(cleaned);
  const result = schema.safeParse(parsed);
  if (!result.success) throw new Error("AI returned an invalid response shape");
  return result.data;
}

export function makeEvidence(source: string, basis: string, verified = false) {
  return { source, basis, verified, checkedAt: new Date().toISOString() };
}

export function isUrgentHealthQuestion(text: string) {
  const normalized = text.toLowerCase();
  const hasCurrentSymptom = /\bi (?:am|feel|felt)\s+(?:shaky|sweaty|dizzy|disoriented|confused)\b/.test(normalized);
  const hasGlucoseEmergency = /\b(?:bg|bgl|blood sugar|glucose)\b.{0,24}\b(?:is|was|at|of|below|under|over|above|low|high)?\s*(?:low|high|hypoglycemia|hyperglycemia|[1-4][0-9]|5[0-9]|[4-9][0-9]{2})\b/.test(normalized);
  const hasCurrentGlucoseCondition = /\b(?:i have|i'm having|i am having|experiencing|my)\b.{0,24}\b(?:hypoglycemia|hyperglycemia)\b/.test(normalized);
  return /unconscious|passed out|faint(?:ed|ing)?|seizure|can't stay awake|cannot stay awake|trouble breathing|chest pain|vomit(?:ing)?|wrong insulin|too much insulin|insulin overdose|ketones|fruity breath|deep breathing|severe low|very low/.test(normalized)
    || hasCurrentSymptom
    || hasGlucoseEmergency
    || hasCurrentGlucoseCondition;
}

export function isMedicalTreatmentQuestion(text: string) {
  return /\b(insulin|dose|dosage|medication|medicine|prescription|treatment|should i take|how much.*(?:units|insulin))\b/i.test(text);
}

export const URGENT_HEALTH_RESPONSE =
  "I can’t assess an emergency. If you have severe symptoms (such as confusion, fainting, seizure, trouble breathing, chest pain, vomiting, or concern for very low/high glucose), seek urgent local medical help now or call your local emergency number. If you can, follow your personal diabetes emergency plan and contact your care team. I can provide general dining education once you’re safe.";

export const MEDICAL_TREATMENT_RESPONSE =
  "I can’t provide insulin dosing, medication changes, or treatment instructions. For a personal medical decision, contact your diabetes care team, pharmacist, or urgent local care as appropriate. I can still help with general restaurant food information.";

export function containsUnsafeMedicalAdvice(text: string) {
  return /\b(?:take|inject|give|increase|decrease|adjust|skip|double)\b.{0,60}\b(?:insulin|units?|medication|medicine|dose|dosage|prescription)\b|\b(?:you have|this means you have|you are experiencing|your symptoms indicate)\b.{0,60}\b(?:diabetes|hypoglycemia|hyperglycemia|dka|ketoacidosis)\b|\b(?:will|guaranteed|definitely)\b.{0,50}\b(?:raise|spike|lower|stabilize)\b.{0,50}\b(?:glucose|blood sugar)\b|\b(?:safe|safest)\b.{0,40}\b(?:for diabet(?:es|ics)|blood sugar)\b/i.test(text);
}

export function assertSafeEducationalText(value: unknown) {
  const text = JSON.stringify(value);
  if (containsUnsafeMedicalAdvice(text)) {
    throw new Error("AI response did not meet medical-safety requirements");
  }
}