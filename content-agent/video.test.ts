import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  buildVideoComposition,
  calculateSlideTimings,
  escapeDrawtext,
  limitOpeningHook,
  MAX_OPENING_HOOK_CHARACTERS,
  renderBrowserPreview,
  selectSceneAssetPaths,
  toAsciiSafeText,
  wrapOpeningHook,
  wrapOverlayText,
} from "./video";
import { DEFAULT_DIABEATS_VIDEO_TEMPLATE, DIABEATS_SOCIAL_V3, DIABEATS_SOCIAL_V4 } from "./video-template";

const scenes = [
  { seconds: 5, onScreenText: "Compare the menu nutrition details before ordering.", visual: "Restaurant menu board" },
  { seconds: 5, onScreenText: "Scan the package label and compare the serving size.", visual: "Barcode on a packaged product" },
  { seconds: 5, onScreenText: "Choose the option that fits your care plan.", visual: "Colorful plated food" },
];

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const ffprobeAvailable = spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

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

test("limits an opening hook without adding an ellipsis", () => {
  const hook = limitOpeningHook("Compare this menu before you decide what to order for dinner tonight with friends");

  assert.ok(hook.length <= MAX_OPENING_HOOK_CHARACTERS);
  assert.equal(hook.endsWith("..."), false);
});
test("never inserts ellipses when wrapping a long opening-hook token", () => {
  const lines = wrapOpeningHook("ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABC...");

  assert.ok(lines.every((line) => line.length <= 29));
  assert.equal(lines.join(" ").includes("..."), false);
});

test("calculates slide timing with fade overlaps and preserves audio coverage", () => {
  const timings = calculateSlideTimings(scenes, 18);

  assert.equal(timings.length, 3);
  assert.equal(timings[0].start, 0);
  assert.equal(timings[1].start, 4.76);
  assert.equal(timings[2].start, 9.52);
  assert.equal(timings[2].end, 18);
});

test("builds a photo-led DiabEats composition with restrained fades and a final disclaimer", () => {
  const composition = buildVideoComposition(
    scenes,
    "A practical menu question — compare before you order",
    "Explore more in DiabEats",
    "General education only — not medical advice. Individual responses vary.",
    18,
  );

  assert.equal(composition.timings.length, 3);
  assert.equal(composition.totalDuration, 18);
  assert.equal((composition.filter.match(/xfade=transition=fade/g) || []).length, 2);
  assert.match(composition.filter, /scale=2200:2200:force_original_aspect_ratio=increase/);
  assert.match(composition.filter, /crop=1080:1920/);
  assert.match(composition.filter, /DIABEATS/);
  assert.match(composition.filter, /EAT OUT WITH MORE CONTEXT/);
  assert.match(composition.filter, /Check your meal with/);
  assert.match(composition.filter, /DiabEats/);
  assert.match(composition.filter, /1 of 3/);
  assert.match(composition.filter, /General education only - not medical/);
  assert.match(composition.filter, /advice\. Individual responses vary/);
  assert.match(composition.filter, /overlay=x=76:y=58/);
  assert.match(composition.filter, /overlay=x=800:y=1350/);
  assert.match(composition.filter, /scale=120:120/);
  assert.match(composition.filter, /scale=180:180/);
  assert.match(composition.filter, /apad,atrim=duration=18.000\[audio\]/);
  assert.match(composition.filter, /\[4:a\]/);
  assert.equal(/[^\x20-\x7E]/.test(composition.filter), false);
});

test("keeps template presentation configuration separate from content", () => {
  const composition = buildVideoComposition(
    scenes,
    "Compare the menu before you order",
    "Explore DiabEats",
    "General education only - not medical advice.",
  );

  assert.equal(DIABEATS_SOCIAL_V3.id, "diabeats-social-v3");
  assert.equal(DIABEATS_SOCIAL_V3.finalCallToAction, "Check your meal with DiabEats.");
  assert.equal(DIABEATS_SOCIAL_V3.assetPaths?.length, 4);
  assert.match(composition.filter, /0x4ED7B1/);
});

test("uses the approved V4 presentation for normal generated videos", () => {
  assert.equal(DEFAULT_DIABEATS_VIDEO_TEMPLATE, DIABEATS_SOCIAL_V4);
  assert.match(DIABEATS_SOCIAL_V4.logoPath ?? "", /content-agent[\\/]assets[\\/]diabeats-logo-transparent\.png$/);

  const composition = buildVideoComposition(
    scenes,
    "Compare the menu before you order",
    "Explore DiabEats",
    "General education only - not medical advice.",
  );

  assert.match(composition.filter, /0x061B25@0.05/);
  assert.match(composition.filter, /0x061B25@0.08/);
  assert.match(composition.filter, /0x061B25@0.46/);
});

test("reuses a template's visual assets when a draft has more scenes", () => {
  const selected = selectSceneAssetPaths(
    {
      ...DIABEATS_SOCIAL_V3,
      assetPaths: ["first.jpg", "second.jpg"],
    },
    5,
  );

  assert.deepEqual(selected, ["first.jpg", "second.jpg", "first.jpg", "second.jpg", "first.jpg"]);
});

test("fails clearly when an image set contains an empty asset path", () => {
  assert.throws(
    () => selectSceneAssetPaths({ ...DIABEATS_SOCIAL_V4, assetPaths: ["meal.jpg", ""] }, 3),
    /Video template image is missing for asset 2/,
  );
});

test("renders a browser-compatible VP9 WebM sidecar with Opus audio", { skip: !ffmpegAvailable || !ffprobeAvailable }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "diabeats-webm-preview-"));
  const sourcePath = path.join(directory, "source.mp4");
  const previewPath = path.join(directory, "preview.webm");
  try {
    const generated = spawnSync("ffmpeg", [
      "-v", "error",
      "-y",
      "-f", "lavfi",
      "-i", "color=c=navy:s=160x90:r=8",
      "-f", "lavfi",
      "-i", "anullsrc=r=48000:cl=mono",
      "-t", "0.5",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      sourcePath,
    ], { stdio: "pipe" });
    assert.equal(generated.status, 0, generated.stderr.toString());

    await renderBrowserPreview(sourcePath, previewPath);
    await access(previewPath);

    const probe = spawnSync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=format_name:stream=codec_type,codec_name,pix_fmt",
      "-of", "json",
      previewPath,
    ], { encoding: "utf8" });
    assert.equal(probe.status, 0, probe.stderr);
    const metadata = JSON.parse(probe.stdout) as {
      format?: { format_name?: string };
      streams?: Array<{ codec_type?: string; codec_name?: string; pix_fmt?: string }>;
    };
    assert.match(metadata.format?.format_name ?? "", /matroska,webm/);
    assert.ok(metadata.streams?.some((stream) =>
      stream.codec_type === "video" && stream.codec_name === "vp9" && stream.pix_fmt === "yuv420p"));
    assert.ok(metadata.streams?.some((stream) => stream.codec_type === "audio" && stream.codec_name === "opus"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
