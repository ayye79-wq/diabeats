import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import type { ContentPackage } from "./types";
import { DEFAULT_DIABEATS_VIDEO_TEMPLATE, type DiabEatsVideoTemplate } from "./video-template";

const FRAME_RATE = 30;
const SAFE_LEFT = 100;
const SAFE_WIDTH = 880;
export const MAX_OPENING_HOOK_CHARACTERS = 55;
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

export type VideoScene = ContentPackage["scenes"][number];

export interface SlideTiming {
  index: number;
  start: number;
  end: number;
  duration: number;
}

export interface VideoComposition {
  filter: string;
  totalDuration: number;
  timings: SlideTiming[];
}

export function selectSceneAssetPaths(template: DiabEatsVideoTemplate, sceneCount: number) {
  const assetPaths = template.assetPaths ?? (template.assetPath ? [template.assetPath] : []);
  if (!assetPaths.length) throw new Error("Video template needs at least one image asset");
  const missingAssetIndex = assetPaths.findIndex((assetPath) => typeof assetPath !== "string" || !assetPath.trim());
  if (missingAssetIndex >= 0) {
    throw new Error(`Video template image is missing for asset ${missingAssetIndex + 1}`);
  }
  return Array.from({ length: sceneCount }, (_, index) => {
    const assetPath = assetPaths[index % assetPaths.length];
    if (!assetPath) throw new Error(`Video template image is missing for scene ${index + 1}`);
    return assetPath;
  });
}

function formatSeconds(value: number) {
  return Math.max(0, value).toFixed(3);
}

export function toAsciiSafeText(value: string) {
  return value
    .replace(/â€”|â€“|â€"/g, "-")
    .replace(/â€¢/g, "-")
    .replace(/â€¦/g, "...")
    .replace(/[—–]/g, "-")
    .replace(/[•·]/g, "-")
    .replace(/[→⇒]/g, "->")
    .replace(/…/g, "...")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

export function wrapOverlayText(value: string, maxCharacters: number, maxLines: number) {
  const lines: string[] = [];
  const paragraphs = toAsciiSafeText(value).split("\n").map((paragraph) => paragraph.trim()).filter(Boolean);
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const shortenedWord = word.length > maxCharacters ? `${word.slice(0, Math.max(1, maxCharacters - 3))}...` : word;
      const candidate = current ? `${current} ${shortenedWord}` : shortenedWord;
      if (candidate.length <= maxCharacters) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (lines.length === maxLines) break;
      current = shortenedWord;
    }
    if (current && lines.length < maxLines) lines.push(current);
    if (lines.length === maxLines) break;
  }

  const sourceText = paragraphs.join(" ");
  const renderedText = lines.join(" ").replace(/\.\.\.$/, "");
  if (sourceText.length > renderedText.length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, Math.max(1, maxCharacters - 3)).replace(/\.*$/, "")}...`;
  }

  return lines.slice(0, maxLines);
}

export function limitOpeningHook(value: string) {
  const clean = toAsciiSafeText(value).replace(/\n/g, " ").replace(/\.{3,}/g, "").trim();
  if (clean.length <= MAX_OPENING_HOOK_CHARACTERS) return clean;
  const clipped = clean.slice(0, MAX_OPENING_HOOK_CHARACTERS).trimEnd();
  const wordBoundary = clipped.lastIndexOf(" ");
  return wordBoundary >= 20 ? clipped.slice(0, wordBoundary) : clipped;
}

export function wrapOpeningHook(value: string) {
  const words = limitOpeningHook(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > 29) {
      if (current) lines.push(current);
      for (let index = 0; index < word.length && lines.length < 3; index += 29) {
        lines.push(word.slice(index, index + 29));
      }
      current = "";
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= 29) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current && lines.length < 3) lines.push(current);
  return lines.slice(0, 3);
}

export function escapeDrawtext(value: string) {
  return toAsciiSafeText(value)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%");
}

export function calculateSlideTimings(
  scenes: VideoScene[],
  audioDuration = 0,
  transitionSeconds = DEFAULT_DIABEATS_VIDEO_TEMPLATE.transitionSeconds,
): SlideTiming[] {
  if (!scenes.length) throw new Error("At least one scene is required to render a video");

  const durations = scenes.map((scene) => Math.max(0.5, scene.seconds));
  const baseDuration = durations.reduce((total, duration) => total + duration, 0) - transitionSeconds * (scenes.length - 1);
  if (audioDuration > baseDuration) durations[durations.length - 1] += audioDuration - baseDuration;

  let start = 0;
  return durations.map((duration, index) => {
    const timing = { index, start, end: start + duration, duration };
    start += duration - (index === durations.length - 1 ? 0 : transitionSeconds);
    return timing;
  });
}

function enabledBetween(start: number, end: number) {
  return `enable='between(t\\,${formatSeconds(start)}\\,${formatSeconds(end)})'`;
}

function drawTextLines(
  lines: string[],
  fontfile: string,
  fontcolor: string,
  fontsize: number,
  x: number,
  y: number,
  lineHeight: number,
  enable?: string,
) {
  return lines.map((line, index) => [
    `drawtext=fontfile=${fontfile}`,
    `text='${escapeDrawtext(line)}'`,
    `fontcolor=${fontcolor}`,
    `fontsize=${fontsize}`,
    `x=${x}`,
    `y=${y + lineHeight * index}`,
    enable,
  ].filter(Boolean).join(":"));
}

function progressFilters(timings: SlideTiming[], template: DiabEatsVideoTemplate) {
  const segmentWidth = Math.floor(SAFE_WIDTH / timings.length);
  return [
    `drawbox=x=100:y=1774:w=880:h=8:color=${template.colors.text}@0.24:t=fill`,
    ...timings.map((timing) =>
      `drawbox=x=${SAFE_LEFT + timing.index * segmentWidth}:y=1774:w=${Math.max(8, segmentWidth - 8)}:h=8:color=${template.colors.accent}@0.96:t=fill:${enabledBetween(timing.start, timing.end)}`),
  ];
}

export function buildVideoComposition(
  scenes: VideoScene[],
  hook: string,
  callToAction: string,
  disclaimer: string,
  audioDuration = 0,
  template: DiabEatsVideoTemplate = DEFAULT_DIABEATS_VIDEO_TEMPLATE,
): VideoComposition {
  const timings = calculateSlideTimings(scenes, audioDuration, template.transitionSeconds);
  const totalDuration = timings[timings.length - 1].end;
  const filterParts: string[] = [];
  const logoInputIndex = template.logoPath ? scenes.length : undefined;
  const audioInputIndex = scenes.length + (template.logoPath ? 1 : 0);
  for (const timing of timings) {
    const panStart = timing.index % 2 === 0 ? 0.34 : 0.54;
    const panDistance = timing.index % 2 === 0 ? 0.12 : -0.12;
    filterParts.push(
      `[${timing.index}:v]scale=2200:2200:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)*(${panStart}+${panDistance}*t/${formatSeconds(timing.duration)})':y='(in_h-out_h)*0.5',setsar=1[scene${timing.index}]`,
    );
  }
  let videoLabel = "[scene0]";

  for (let index = 1; index < scenes.length; index += 1) {
    const previous = timings[index - 1];
    const transitionStart = previous.end - template.transitionSeconds;
    const output = `[slide${index}]`;
    filterParts.push(`${videoLabel}[scene${index}]xfade=transition=fade:duration=${formatSeconds(template.transitionSeconds)}:offset=${formatSeconds(transitionStart)}${output}`);
    videoLabel = output;
  }

  const brandTextX = template.logoPath ? 232 : 82;
  const brandSubtitleX = template.logoPath ? 234 : 84;
  const overlayFilters = [
    `drawbox=x=0:y=0:w=1080:h=1920:color=${template.colors.ink}@${template.backgroundOverlayOpacity ?? 0.18}:t=fill`,
    `drawbox=x=0:y=960:w=1080:h=960:color=${template.colors.ink}@${template.lowerOverlayOpacity ?? 0.72}:t=fill`,
    `drawbox=x=52:y=52:w=976:h=132:color=${template.colors.ink}@${template.headerCardOpacity ?? 0.62}:t=fill`,
    `drawtext=fontfile=${FONT_BOLD}:text='DIABEATS':fontcolor=${template.colors.accent}:fontsize=56:x=${brandTextX}:y=78`,
    `drawtext=fontfile=${FONT_REGULAR}:text='EAT OUT WITH MORE CONTEXT':fontcolor=${template.colors.mutedText}:fontsize=22:x=${brandSubtitleX}:y=140`,
    ...timings.flatMap((timing) => {
      const scene = scenes[timing.index];
      const enable = enabledBetween(timing.start, timing.end);
      const headline = timing.index === 0 ? limitOpeningHook(hook) : scene.onScreenText;
      const isOpening = timing.index === 0;
      const isFinal = timing.index === timings.length - 1;
      const filters = [
        `drawbox=x=${isOpening ? 62 : 56}:y=${isOpening ? 300 : 1028}:w=${isOpening ? 956 : 968}:h=${isOpening ? 388 : isFinal ? 700 : 610}:color=${template.colors.surface}@${template.textCardOpacity ?? 0.86}:t=fill:${enable}`,
        `drawbox=x=${isOpening ? 88 : 84}:y=${isOpening ? 332 : 1060}:w=${isOpening ? 252 : 300}:h=52:color=${template.colors.accent}@0.96:t=fill:${enable}`,
        `drawtext=fontfile=${FONT_BOLD}:text='${isOpening ? "QUICK CHECK" : isFinal ? "NEXT STEP" : "MEAL COMPARISON"}':fontcolor=${template.colors.ink}:fontsize=${isOpening ? 26 : 22}:x=${isOpening ? 112 : 108}:y=${isOpening ? 345 : 1075}:${enable}`,
        ...drawTextLines(
          wrapOverlayText(headline, isOpening ? 22 : 28, isOpening ? 3 : isFinal ? 2 : 4),
          FONT_BOLD,
          template.colors.text,
          isOpening ? 76 : isFinal ? 52 : 48,
          isOpening ? 100 : 108,
          isOpening ? 410 : 1140,
          isOpening ? 90 : isFinal ? 62 : 60,
          enable,
        ),
        `drawtext=fontfile=${FONT_REGULAR}:text='${timing.index + 1} of ${timings.length}':fontcolor=${template.colors.mutedText}:fontsize=26:x=880:y=100:${enable}`,
      ];

      if (isFinal) {
        filters.push(
          `drawbox=x=84:y=1330:w=912:h=330:color=${template.colors.ink}@${template.finalInnerCardOpacity ?? 0.88}:t=fill:${enable}`,
          ...drawTextLines(wrapOverlayText(template.finalCallToAction, 28, 2), FONT_BOLD, template.colors.accent, 62, 112, 1380, 74, enable),
          ...drawTextLines(wrapOverlayText(disclaimer, 42, 2), FONT_REGULAR, template.colors.mutedText, 36, 112, 1540, 50, enable),
          `drawtext=fontfile=${FONT_REGULAR}:text='Examples vary by menu and serving.':fontcolor=${template.colors.mutedText}:fontsize=28:x=112:y=1640:${enable}`,
        );
      }
      return filters;
    }),
    ...progressFilters(timings, template),
  ];

  filterParts.push(`${videoLabel}format=yuv420p,${overlayFilters.join(",")}[videoBase]`);
  if (logoInputIndex !== undefined) {
    filterParts.push(
      `[${logoInputIndex}:v]format=rgba,split=2[logoHeaderSource][logoFinalSource]`,
      `[logoHeaderSource]scale=120:120[logoHeader]`,
      `[logoFinalSource]scale=180:180[logoFinal]`,
      `[videoBase][logoHeader]overlay=x=76:y=58:format=auto:eof_action=repeat[videoHeader]`,
      `[videoHeader][logoFinal]overlay=x=800:y=1350:format=auto:eof_action=repeat:enable='between(t\\,${formatSeconds(timings[timings.length - 1]!.start)}\\,${formatSeconds(totalDuration)})'[video]`,
    );
  } else {
    filterParts.push(`[videoBase]null[video]`);
  }
  filterParts.push(`[${audioInputIndex}:a]apad,atrim=duration=${formatSeconds(totalDuration)}[audio]`);
  return { filter: filterParts.join(";"), totalDuration, timings };
}

async function probeAudioDuration(audioPath: string) {
  return new Promise<number>((resolve) => {
    let output = "";
    const child = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      audioPath,
    ]);
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.on("error", () => resolve(0));
    child.on("exit", (code) => {
      const duration = Number.parseFloat(output.trim());
      resolve(code === 0 && Number.isFinite(duration) ? duration : 0);
    });
  });
}

export async function renderVerticalVideo(
  audioPath: string,
  destination: string,
  content: Pick<ContentPackage, "hook" | "callToAction" | "scenes" | "disclaimer">,
  options: { template?: DiabEatsVideoTemplate; assetPaths?: string[] } = {},
) {
  const template = options.template ?? DEFAULT_DIABEATS_VIDEO_TEMPLATE;
  const audioDuration = await probeAudioDuration(audioPath);
  const composition = buildVideoComposition(
    content.scenes,
    content.hook,
    content.callToAction,
    content.disclaimer,
    audioDuration,
    template,
  );
  const selectedAssetPaths = options.assetPaths
    ? selectSceneAssetPaths({ ...template, assetPaths: options.assetPaths }, content.scenes.length)
    : selectSceneAssetPaths(template, content.scenes.length);
  if (template.logoPath) {
    try {
      await access(template.logoPath);
    } catch {
      throw new Error(`Video logo asset is unavailable: ${template.logoPath}`);
    }
  }
  await Promise.all(selectedAssetPaths.map(async (assetPath) => {
    try {
      await access(assetPath);
    } catch {
      throw new Error(`Video image asset is unavailable: ${assetPath}`);
    }
  }));
  const inputs = content.scenes.flatMap((scene, index) => [
    "-loop", "1",
    "-t", formatSeconds(composition.timings[index].duration),
    "-framerate", String(FRAME_RATE),
    "-i", selectedAssetPaths[index]!,
  ]);
  if (template.logoPath) {
    inputs.push("-loop", "1", "-t", formatSeconds(composition.totalDuration), "-i", template.logoPath);
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-y",
      ...inputs,
      "-i", audioPath,
      "-filter_complex", composition.filter,
      "-map", "[video]",
      "-map", "[audio]",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-r", String(FRAME_RATE),
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      destination,
    ], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
  });
}

export async function renderBrowserPreview(videoPath: string, destination: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-y",
      "-i", videoPath,
      "-c:v", "libvpx-vp9",
      "-pix_fmt", "yuv420p",
      "-b:v", "1200k",
      "-crf", "32",
      "-row-mt", "1",
      "-cpu-used", "4",
      "-c:a", "libopus",
      "-b:a", "96k",
      destination,
    ], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`browser preview rendering exited with ${code}`)));
  });
}