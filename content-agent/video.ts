import { spawn } from "node:child_process";
import type { ContentPackage } from "./types";

const FRAME_RATE = 30;
const TRANSITION_SECONDS = 0.35;
const SAFE_LEFT = 100;
const SAFE_WIDTH = 880;
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const SLIDE_COLORS = ["0x0E3852", "0x123D4A", "0x28365A", "0x22443D", "0x3D3155", "0x17364A", "0x37402A"];

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

type VisualKind = "barcode" | "menu" | "food";

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
  const words = toAsciiSafeText(value).replace(/\n/g, " ").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
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

  const hasOverflow = words.join(" ").length > lines.join(" ").replace(/\.\.\.$/, "").length;
  if (hasOverflow && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, Math.max(1, maxCharacters - 3)).replace(/\.*$/, "")}...`;
  }

  return lines.slice(0, maxLines);
}

export function escapeDrawtext(value: string) {
  return toAsciiSafeText(value)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%");
}

export function calculateSlideTimings(scenes: VideoScene[], audioDuration = 0): SlideTiming[] {
  if (!scenes.length) throw new Error("At least one scene is required to render a video");

  const durations = scenes.map((scene) => Math.max(0.5, scene.seconds));
  const baseDuration = durations.reduce((total, duration) => total + duration, 0) - TRANSITION_SECONDS * (scenes.length - 1);
  if (audioDuration > baseDuration) durations[durations.length - 1] += audioDuration - baseDuration;

  let start = 0;
  return durations.map((duration, index) => {
    const timing = { index, start, end: start + duration, duration };
    start += duration - (index === durations.length - 1 ? 0 : TRANSITION_SECONDS);
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

function preferredVisualKind(visual: string): VisualKind {
  const normalized = toAsciiSafeText(visual).toLowerCase();
  if (/(barcode|label|package|product)/.test(normalized)) return "barcode";
  if (/(menu|restaurant|dish|order)/.test(normalized)) return "menu";
  return "food";
}

function assignVisualKinds(scenes: VideoScene[]) {
  const remaining = new Set<VisualKind>(["menu", "barcode", "food"]);
  return scenes.map((scene) => {
    const preferred = preferredVisualKind(scene.visual);
    const kind = remaining.has(preferred) ? preferred : (remaining.values().next().value ?? preferred);
    remaining.delete(kind);
    return kind;
  });
}

function sceneVisualFilters(kind: VisualKind, timing: SlideTiming) {
  const enable = enabledBetween(timing.start, timing.end);
  const common = [
    `drawbox=x=700:y=250:w=280:h=300:color=0x071A2B@0.42:t=fill:${enable}`,
    `drawbox=x=700:y=250:w=280:h=300:color=0x35C6A5@0.55:t=2:${enable}`,
  ];

  if (kind === "barcode") {
    return [
      ...common,
      `drawtext=fontfile=${FONT_BOLD}:text='SCAN':fontcolor=0xDCEBE8:fontsize=28:x=780:y=290:${enable}`,
      ...[0, 18, 42, 60, 92, 115, 145, 171, 205].map((offset, index) =>
        `drawbox=x=${730 + offset}:y=355:w=${index % 3 === 0 ? 10 : 5}:h=120:color=white@0.9:t=fill:${enable}`),
      `drawtext=fontfile=${FONT_REGULAR}:text='||| BARCODE |||':fontcolor=0x91AAA5:fontsize=20:x=730:y=495:${enable}`,
    ];
  }

  if (kind === "menu") {
    return [
      ...common,
      `drawtext=fontfile=${FONT_BOLD}:text='MENU':fontcolor=0xDCEBE8:fontsize=30:x=785:y=290:${enable}`,
      ...[0, 1, 2].flatMap((row) => [
        `drawbox=x=735:y=${355 + row * 45}:w=205:h=9:color=0xDCEBE8@0.85:t=fill:${enable}`,
        `drawbox=x=735:y=${373 + row * 45}:w=${row === 1 ? 135 : 170}:h=7:color=0x91AAA5@0.75:t=fill:${enable}`,
      ]),
    ];
  }

  return [
    ...common,
    `drawtext=fontfile=${FONT_BOLD}:text='o':fontcolor=0xF7D775:fontsize=210:x=810:y=270:${enable}`,
    `drawbox=x=760:y=465:w=160:h=8:color=0x35C6A5@0.9:t=fill:${enable}`,
    `drawtext=fontfile=${FONT_BOLD}:text='FOOD':fontcolor=0xDCEBE8:fontsize=26:x=795:y=500:${enable}`,
  ];
}

function progressFilters(timings: SlideTiming[]) {
  const segmentWidth = Math.floor(SAFE_WIDTH / timings.length);
  return [
    "drawbox=x=100:y=1660:w=880:h=10:color=0xDCEBE8@0.25:t=fill",
    ...timings.map((timing) =>
      `drawbox=x=${SAFE_LEFT + timing.index * segmentWidth}:y=1660:w=${Math.max(8, segmentWidth - 8)}:h=10:color=0x35C6A5@0.95:t=fill:${enabledBetween(timing.start, timing.end)}`),
  ];
}

export function buildVideoComposition(
  scenes: VideoScene[],
  hook: string,
  callToAction: string,
  disclaimer: string,
  audioDuration = 0,
): VideoComposition {
  const timings = calculateSlideTimings(scenes, audioDuration);
  const totalDuration = timings[timings.length - 1].end;
  const visualKinds = assignVisualKinds(scenes);
  const filterParts: string[] = [];
  let videoLabel = "[0:v]";

  for (let index = 1; index < scenes.length; index += 1) {
    const previous = timings[index - 1];
    const transitionStart = previous.end - TRANSITION_SECONDS;
    const output = `[slide${index}]`;
    filterParts.push(`${videoLabel}[${index}:v]xfade=transition=fade:duration=${formatSeconds(TRANSITION_SECONDS)}:offset=${formatSeconds(transitionStart)}${output}`);
    videoLabel = output;
  }

  const overlayFilters = [
    "drawbox=x=55:y=140:w=970:h=1550:color=0x071A2B@0.34:t=fill",
    "drawbox=x=55:y=140:w=12:h=1550:color=0x35C6A5@0.95:t=fill",
    `drawtext=fontfile=${FONT_BOLD}:text='DIABEATS':fontcolor=0x35C6A5:fontsize=52:x=100:y=185`,
    ...timings.flatMap((timing) => {
      const scene = scenes[timing.index];
      const enable = enabledBetween(timing.start, timing.end);
      const headline = timing.index === 0 ? hook : scene.onScreenText;
      const filters = [
        ...sceneVisualFilters(visualKinds[timing.index], timing),
        ...drawTextLines(wrapOverlayText(headline, 29, 3), FONT_BOLD, "white", 54, SAFE_LEFT, 620, 70, enable),
        ...drawTextLines(wrapOverlayText(scene.onScreenText, 36, 3), FONT_REGULAR, "0xDCEBE8", 38, SAFE_LEFT, 910, 54, enable),
        `drawtext=fontfile=${FONT_BOLD}:text='${timing.index + 1}/${timings.length}':fontcolor=0x91AAA5:fontsize=26:x=900:y=190:${enable}`,
      ];

      if (timing.index === timings.length - 1) {
        filters.push(
          `drawbox=x=85:y=1245:w=910:h=300:color=0x071A2B@0.6:t=fill:${enable}`,
          ...drawTextLines(wrapOverlayText(callToAction, 37, 2), FONT_BOLD, "0x35C6A5", 38, SAFE_LEFT, 1290, 52, enable),
          ...drawTextLines(wrapOverlayText(disclaimer, 45, 3), FONT_REGULAR, "0xDCEBE8", 27, SAFE_LEFT, 1420, 38, enable),
        );
      }
      return filters;
    }),
    ...progressFilters(timings),
  ];

  filterParts.push(`${videoLabel}format=yuv420p,${overlayFilters.join(",")}[video]`);
  filterParts.push(`[${scenes.length}:a]apad,atrim=duration=${formatSeconds(totalDuration)}[audio]`);
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
) {
  const audioDuration = await probeAudioDuration(audioPath);
  const composition = buildVideoComposition(
    content.scenes,
    content.hook,
    content.callToAction,
    content.disclaimer,
    audioDuration,
  );
  const inputs = content.scenes.flatMap((scene, index) => [
    "-f", "lavfi",
    "-t", formatSeconds(composition.timings[index].duration),
    "-i", `color=c=${SLIDE_COLORS[index % SLIDE_COLORS.length]}:s=1080x1920:r=${FRAME_RATE}`,
  ]);

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