import assert from "node:assert/strict";
import test from "node:test";
import { parseGeneratedDraft } from "./generator";

function draftWithVisual(visual: string) {
  return JSON.stringify({
    topic: "fiber",
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