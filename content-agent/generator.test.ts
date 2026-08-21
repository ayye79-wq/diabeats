import assert from "node:assert/strict";
import test from "node:test";
import { generationPrompt, parseGeneratedDraft } from "./generator";
import { APPROVED_FEATURES } from "./feature-manifest";

function draftWithVisual(visual: string) {
  return JSON.stringify({
    topic: "fiber",
    featureIds: ["menu-item-information"],
    hook: "A practical restaurant question",
    voiceover: "Restaurant nutrition can vary. Compare the fiber and carbohydrate information, verify the portion, and use the approach that fits your own care plan.",
    scenes: [
      { seconds: 5, onScreenText: "Check the menu", visual: "A menu on a restaurant table" },
      { seconds: 5, onScreenText: "Compare nutrition", visual },
      { seconds: 5, onScreenText: "Verify the portion", visual: "A plated restaurant meal" },
    ],
    caption: "Use menu nutrition details to make an informed restaurant choice.",
    hashtags: ["#DiabEats", "#DiabetesEducation"],
    callToAction: "Explore more in DiabEats",
  });
}

test("truncates an overly detailed scene visual before validating a generated draft", () => {
  const draft = parseGeneratedDraft(draftWithVisual("A".repeat(240)));

  assert.equal(draft.scenes[1].visual.length, 180);
  assert.ok(draft.scenes[1].visual.endsWith("…"));
});

test("preserves scene visual descriptions within the schema limit", () => {
  const draft = parseGeneratedDraft(draftWithVisual("A bright restaurant menu board"));

  assert.equal(draft.scenes[1].visual, "A bright restaurant menu board");
});

test("rejects a generated feature claim outside the approved manifest", () => {
  const raw = JSON.parse(draftWithVisual("A menu board"));
  raw.featureIds = ["portion-slider-controls"];

  assert.throws(() => parseGeneratedDraft(JSON.stringify(raw)));
});

test("requires opening hooks to fit the 55-character renderer limit", () => {
  const raw = JSON.parse(draftWithVisual("A menu board"));
  raw.hook = "A".repeat(56);

  assert.throws(() => parseGeneratedDraft(JSON.stringify(raw)));
});

test("generation prompt exposes only the approved feature manifest", () => {
  const prompt = generationPrompt([]);

  for (const feature of APPROVED_FEATURES) assert.match(prompt, new RegExp(feature.id));
  assert.match(prompt, /Never claim portion sliders/);
  assert.match(prompt, /glucose prediction/);
});