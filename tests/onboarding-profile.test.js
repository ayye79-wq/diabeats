const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const onboarding = fs.readFileSync(path.join(root, "app", "onboarding.tsx"), "utf8");
const profile = fs.readFileSync(path.join(root, "app", "(tabs)", "profile.tsx"), "utf8");
const context = fs.readFileSync(path.join(root, "context", "AppContext.tsx"), "utf8");

test("onboarding has four steps and does not assign a carbohydrate target", () => {
  assert.match(onboarding, /type Step = 1 \| 2 \| 3 \| 4;/);
  assert.match(onboarding, /\[1, 2, 3, 4\]\.map/);
  assert.doesNotMatch(onboarding, /setDailyCarbTarget/);
  assert.doesNotMatch(onboarding, /Suggested per meal/);
  assert.match(onboarding, /personal care plan or healthcare professional/);
});

test("profile offers an explicit optional care-plan target and no-target choice", () => {
  assert.match(profile, /Care-plan carbohydrate target \(optional\)/);
  assert.match(profile, /personal care plan or healthcare professional/);
  assert.match(profile, /No target/);
  assert.match(profile, /setDailyCarbTarget\(null\)/);
});

test("carbohydrate target persistence accepts null while preserving positive legacy numbers", () => {
  assert.match(context, /dailyCarbTarget: number \| null/);
  assert.match(context, /setDailyCarbTarget: \(target: number \| null\)/);
  assert.match(context, /parsedProfile\.dailyCarbTarget === null/);
  assert.match(context, /typeof parsedProfile\.dailyCarbTarget === "number"/);
  assert.match(context, /useState<number \| null>\(null\)/);
});