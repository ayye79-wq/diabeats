import assert from "node:assert/strict";
import test from "node:test";

import { calculateMealPhotoAnalysis } from "../shared/meal-photo";
import { createMealAnalysisToken, verifyMealAnalysisToken } from "../server/services/meal-analysis-token";

const analysis = calculateMealPhotoAnalysis({
  mealName: "Unknown plate",
  items: [],
  unknownItems: ["food not identified"],
});
const secret = "test-signing-secret";
const now = 1_800_000_000_000;

test("round-trips a canonical meal analysis for the same session", () => {
  const token = createMealAnalysisToken({ secret, sessionId: "session-a", analysis, now });
  assert.deepEqual(
    verifyMealAnalysisToken({ secret, sessionId: "session-a", token, now: now + 1_000 }),
    analysis,
  );
});

test("rejects forged and cross-session meal analysis tokens", () => {
  const token = createMealAnalysisToken({ secret, sessionId: "session-a", analysis, now });
  const [payload, signature] = token.split(".");
  const forgedSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  assert.throws(() => verifyMealAnalysisToken({
    secret,
    sessionId: "session-a",
    token: `${payload}.${forgedSignature}`,
    now,
  }), /Invalid meal analysis token/);
  assert.throws(() => verifyMealAnalysisToken({
    secret,
    sessionId: "session-b",
    token,
    now,
  }), /another session/);
});

test("rejects expired meal analysis tokens", () => {
  const token = createMealAnalysisToken({ secret, sessionId: "session-a", analysis, now });
  assert.throws(() => verifyMealAnalysisToken({
    secret,
    sessionId: "session-a",
    token,
    now: now + 60 * 60 * 1_000 + 1,
  }), /expired/);
});