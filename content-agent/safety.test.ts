import assert from "node:assert/strict";
import test from "node:test";
import { approvedFeatureClaimsFor } from "./feature-manifest";
import { CONTENT_DISCLAIMER, validateContent } from "./safety";
import type { ContentPackage } from "./types";

const featureIds = ["menu-item-information"] as const;
const safe: ContentPackage = { id: "x", createdAt: new Date().toISOString(), status: "draft", topic: "fiber", featureIds: [...featureIds], featureClaims: approvedFeatureClaimsFor(featureIds), hook: "Try this ordering question", voiceover: "Restaurant nutrition varies. Compare fiber and total carbohydrate information, verify the portion, and use your own care plan.", scenes: [{ seconds: 5, onScreenText: "Check the portion", visual: "menu" }, { seconds: 5, onScreenText: "Compare nutrients", visual: "labels" }, { seconds: 5, onScreenText: "Verify", visual: "DiabEats app" }], caption: "Make a more informed food choice.", hashtags: ["#DiabEats", "#DiabetesEducation"], disclaimer: CONTENT_DISCLAIMER, callToAction: "Explore options in DiabEats" };

test("accepts cautious educational content", () => assert.deepEqual(validateContent(safe), []));
test("rejects cure claims", () => assert.ok(validateContent({ ...safe, caption: "This cures diabetes" }).length > 0));
test("rejects medication instructions", () => assert.ok(validateContent({ ...safe, voiceover: "Stop taking insulin before this meal" }).length > 0));
test("rejects feature IDs outside the approved manifest", () => assert.ok(validateContent({ ...safe, featureIds: ["unreleased-feature" as never] }).some((error) => error.includes("Unsupported feature claim"))));
test("rejects unsupported DiabEats workflows even with an approved feature ID", () => {
  const unsupportedClaims = [
    ["Use our portion slider before you order.", "portion sliders"],
    ["Set a pinned meal-specific carb target.", "pinned meal-specific carb targets"],
    ["Open the restaurant PDF from the meal screen.", "restaurant PDF opening"],
    ["Use DiabEats for a glucose prediction.", "glucose prediction"],
  ];

  for (const [caption, expected] of unsupportedClaims) {
    assert.ok(validateContent({ ...safe, caption }).some((error) => error.includes(expected)));
  }
});
test("rejects free-form DiabEats capabilities even when a feature is selected", () => {
  const errors = validateContent({ ...safe, caption: "Scan a barcode with DiabEats. DiabEats lets you view restaurant nutrition information." });

  assert.ok(errors.some((error) => error.includes("manifest-derived feature claims")));
});
test("rejects unlisted capabilities expressed with new verbs and nouns", () => {
  const continuousMonitoringErrors = validateContent({ ...safe, caption: "DiabEats provides continuous glucose monitoring." });
  const coachingErrors = validateContent({ ...safe, caption: "DiabEats provides nutrition coaching." });
  const appErrors = validateContent({ ...safe, caption: "This app supports meal delivery tracking." });

  assert.ok(continuousMonitoringErrors.some((error) => error.includes("manifest-derived feature claims")));
  assert.ok(coachingErrors.some((error) => error.includes("manifest-derived feature claims")));
  assert.ok(appErrors.some((error) => error.includes("manifest-derived feature claims")));
});
test("rejects unsupported workflow paraphrases", () => {
  const errors = validateContent({ ...safe, caption: "Adjust the serving amount with a slider." });

  assert.ok(errors.some((error) => error.includes("portion sliders")));
});
test("rejects unsupported forecast and file-document workflow paraphrases", () => {
  const forecastErrors = validateContent({ ...safe, caption: "DiabEats lets you forecast your glucose." });
  const documentErrors = validateContent({ ...safe, caption: "DiabEats lets you open a restaurant menu file." });

  assert.ok(forecastErrors.some((error) => error.includes("glucose prediction")));
  assert.ok(documentErrors.some((error) => error.includes("manifest-derived feature claims")));
});
test("rejects unsupported workflows even when the app is not named", () => {
  const pdfErrors = validateContent({ ...safe, caption: "Download the restaurant menu PDF before ordering." });
  const targetErrors = validateContent({ ...safe, caption: "Set a carbohydrate goal for each lunch." });
  const glucoseErrors = validateContent({ ...safe, caption: "Estimate your blood sugar after this meal." });

  assert.ok(pdfErrors.some((error) => error.includes("restaurant PDF opening")));
  assert.ok(targetErrors.some((error) => error.includes("pinned meal-specific carb targets")));
  assert.ok(glucoseErrors.some((error) => error.includes("glucose prediction")));
});
test("rejects edited canonical feature claims", () => {
  const errors = validateContent({ ...safe, featureClaims: [{ featureId: "menu-item-information", claim: "Open restaurant PDFs." }] });

  assert.ok(errors.some((error) => error.includes("approved manifest copy")));
});
