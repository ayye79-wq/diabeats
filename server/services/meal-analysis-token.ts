import { createHmac, timingSafeEqual } from "node:crypto";
import { mealPhotoAnalysisSchema, type MealPhotoAnalysis } from "../../shared/meal-photo";

const TOKEN_TTL_MS = 60 * 60 * 1_000;

export function createMealAnalysisToken(input: {
  secret: string;
  sessionId: string;
  analysis: MealPhotoAnalysis;
  now?: number;
}): string {
  if (!input.secret) throw new Error("A signing secret is required.");
  const payload = Buffer.from(JSON.stringify({
    sessionId: input.sessionId,
    expiresAt: (input.now ?? Date.now()) + TOKEN_TTL_MS,
    analysis: input.analysis,
  })).toString("base64url");
  const signature = createHmac("sha256", input.secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyMealAnalysisToken(input: {
  secret: string;
  sessionId: string;
  token: string;
  now?: number;
}): MealPhotoAnalysis {
  if (!input.secret) throw new Error("A signing secret is required.");
  const [payload, signature] = input.token.split(".");
  if (!payload || !signature) throw new Error("Invalid meal analysis token.");
  const expected = createHmac("sha256", input.secret).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("Invalid meal analysis token.");
  }
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    sessionId?: unknown;
    expiresAt?: unknown;
    analysis?: unknown;
  };
  if (
    decoded.sessionId !== input.sessionId ||
    typeof decoded.expiresAt !== "number" ||
    decoded.expiresAt < (input.now ?? Date.now())
  ) {
    throw new Error("Meal analysis token expired or belongs to another session.");
  }
  return mealPhotoAnalysisSchema.parse(decoded.analysis);
}