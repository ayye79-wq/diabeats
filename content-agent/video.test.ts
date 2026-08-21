import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVideoComposition,
  calculateSlideTimings,
  escapeDrawtext,
  toAsciiSafeText,
  wrapOverlayText,
} from "./video";

const scenes = [
  { seconds: 5, onScreenText: "Compare the menu nutrition details before ordering.", visual: "Restaurant menu board" },
  { seconds: 5, onScreenText: "Scan the package label and compare the serving size.", visual: "Barcode on a packaged product" },
  { seconds: 5, onScreenText: "Choose the option that fits your care plan.", visual: "Colorful plated food" },
];

test("normalizes Unicode and FFmpeg-sensitive text to ASCII-safe overlay content", () => {
  const normalized = toAsciiSafeText("Café — menu • scan → compare…");
  const escaped = escapeDrawtext("Today's: 20%, menu");

  assert.equal(normalized, "Cafe - menu - scan -> compare...");
  assert.match(escaped, /Today\\'s\\: 20\\%\\, menu/);
  assert.equal(/[^\x20-\x7E]/.test(normalized), false);
  assert.equal(/[^\x20-\x7E]/.test(escaped), false);
});

test("wraps overlay copy within short, bounded lines", () => {
  const lines = wrapOverlayText(
    "Use the restaurant nutrition details to compare portions before choosing your order today.",
    24,
    3,
  );

  assert.ok(lines.length <= 3);
  assert.ok(lines.every((line) => line.length <= 24));
  assert.ok(lines.at(-1)?.endsWith("..."));
});

test("calculates slide timing with fade overlaps and preserves audio coverage", () => {
  const timings = calculateSlideTimings(scenes, 18);

  assert.equal(timings.length, 3);
  assert.equal(timings[0].start, 0);
  assert.equal(timings[1].start, 4.65);
  assert.equal(timings[2].start, 9.3);
  assert.equal(timings[2].end, 18);
});

test("builds a multi-slide ASCII-only composition with fades, progress, and a final disclaimer", () => {
  const composition = buildVideoComposition(
    scenes,
    "A practical menu question — compare before you order",
    "Explore more in DiabEats →",
    "General education only — not medical advice. Individual responses vary.",
    18,
  );

  assert.equal(composition.timings.length, 3);
  assert.equal(composition.totalDuration, 18);
  assert.equal((composition.filter.match(/xfade=transition=fade/g) || []).length, 2);
  assert.match(composition.filter, /BARCODE/);
  assert.match(composition.filter, /MENU/);
  assert.match(composition.filter, /FOOD/);
  assert.match(composition.filter, /1\/3/);
  assert.match(composition.filter, /General education only - not medical advice/);
  assert.match(composition.filter, /apad,atrim=duration=18.000\[audio\]/);
  assert.equal(/[^\x20-\x7E]/.test(composition.filter), false);
});

test("allocates menu, barcode, and food motifs even when visuals use the same keyword", () => {
  const composition = buildVideoComposition(
    scenes.map((scene) => ({ ...scene, visual: "Restaurant menu" })),
    "Compare the menu before you order",
    "Explore DiabEats",
    "General education only - not medical advice.",
  );

  assert.match(composition.filter, /MENU/);
  assert.match(composition.filter, /BARCODE/);
  assert.match(composition.filter, /FOOD/);
});