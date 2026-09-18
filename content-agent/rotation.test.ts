import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { EMPTY_GENERATION_STATE, parseGenerationState, serializeGenerationState } from "./generation-state";
import {
  CONTENT_ROTATION_PACKAGES,
  ROTATION_HISTORY_LIMIT,
  selectRotationPackage,
  validateRotationPackage,
} from "./rotation";

test("maps every curated comparison to a distinct checked-in meal image", () => {
  const imageSetIds = CONTENT_ROTATION_PACKAGES.map((rotationPackage) => rotationPackage.imageSetId);
  const assetPaths = CONTENT_ROTATION_PACKAGES.flatMap((rotationPackage) => rotationPackage.assetPaths);

  assert.equal(new Set(imageSetIds).size, CONTENT_ROTATION_PACKAGES.length);
  assert.equal(new Set(assetPaths).size, CONTENT_ROTATION_PACKAGES.length);
  for (const rotationPackage of CONTENT_ROTATION_PACKAGES) {
    assert.equal(rotationPackage.assetPaths.length, 1);
    assert.ok(existsSync(rotationPackage.assetPaths[0]!), `${rotationPackage.id} image asset should exist`);
  }
});

test("selects different complete packages for consecutive scheduled runs", () => {
  const first = selectRotationPackage([]);
  const second = selectRotationPackage([first.id]);

  assert.notEqual(first.id, second.id);
  assert.notEqual(first.imageSetId, second.imageSetId);
  assert.notDeepEqual(first.assetPaths, second.assetPaths);
  assert.notDeepEqual(first.requiredTerms, second.requiredTerms);
});

test("reaches every curated package before repeating", () => {
  let recent: string[] = [];
  const selectedIds: string[] = [];

  for (let run = 0; run < CONTENT_ROTATION_PACKAGES.length; run += 1) {
    const selected = selectRotationPackage(recent);
    selectedIds.push(selected.id);
    recent = [selected.id, ...recent].slice(0, ROTATION_HISTORY_LIMIT);
  }

  assert.equal(new Set(selectedIds).size, CONTENT_ROTATION_PACKAGES.length);
  assert.equal(selectRotationPackage(recent).id, CONTENT_ROTATION_PACKAGES[0]!.id);
});

test("skips every package still inside the protected rotation window", () => {
  const recent = CONTENT_ROTATION_PACKAGES.slice(0, 3).map((rotationPackage) => rotationPackage.id);
  const selected = selectRotationPackage(recent);

  assert.equal(selected.id, CONTENT_ROTATION_PACKAGES[3]!.id);
});

test("migrates old topic-only state and ignores malformed values", () => {
  assert.deepEqual(
    parseGenerationState({ recentTopics: ["fiber"], olderField: ["ignored"] }),
    { recentTopics: ["fiber"], recentRotationPackageIds: [] },
  );
  assert.deepEqual(parseGenerationState(null), EMPTY_GENERATION_STATE);
  assert.deepEqual(
    parseGenerationState({
      recentTopics: ["valid", 42, ""],
      recentRotationPackageIds: ["burger-salad-menu", null, ""],
    }),
    { recentTopics: ["valid"], recentRotationPackageIds: ["burger-salad-menu"] },
  );
});

test("preserves valid unique rotation history when cached state contains junk", () => {
  const first = CONTENT_ROTATION_PACKAGES[0]!;
  const second = CONTENT_ROTATION_PACKAGES[1]!;
  const state = parseGenerationState({
    recentTopics: [],
    recentRotationPackageIds: ["unknown-package", first.id, first.id, null, second.id, "another-unknown-package"],
  });

  assert.deepEqual(state.recentRotationPackageIds, [first.id, second.id]);
  assert.equal(selectRotationPackage(state.recentRotationPackageIds).id, CONTENT_ROTATION_PACKAGES[2]!.id);
});

test("defensively ignores unrecognized and duplicate IDs passed to selection", () => {
  const first = CONTENT_ROTATION_PACKAGES[0]!;
  const selected = selectRotationPackage(["unknown-package", first.id, first.id]);

  assert.notEqual(selected.id, first.id);
});

test("limits persisted rotation history to the configured window", () => {
  const ids = [
    ...CONTENT_ROTATION_PACKAGES.map((rotationPackage) => rotationPackage.id),
    ...CONTENT_ROTATION_PACKAGES.slice(0, 2).map((rotationPackage) => rotationPackage.id),
  ];
  const parsed = parseGenerationState({ recentTopics: [], recentRotationPackageIds: ids });

  assert.equal(parsed.recentRotationPackageIds.length, ROTATION_HISTORY_LIMIT);
  assert.equal(JSON.parse(serializeGenerationState(parsed)).recentRotationPackageIds.length, ROTATION_HISTORY_LIMIT);
});

test("rejects content that drifts from its selected nutrition package", () => {
  const rotationPackage = CONTENT_ROTATION_PACKAGES[0]!;
  const errors = validateRotationPackage(
    {
      hook: rotationPackage.hook,
      voiceover: "A different example with no matching meal details.",
      scenes: [],
      caption: "Menus vary.",
      rotationPackageId: rotationPackage.id,
    },
    rotationPackage,
  );

  assert.ok(errors.some((error) => error.includes("burger")));
  assert.ok(errors.some((error) => error.includes("96g")));
});