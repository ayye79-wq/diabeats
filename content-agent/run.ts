import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createVoiceover, generateContent } from "./generator";
import { validateContent } from "./safety";
import { uploadTikTokDraft } from "./tiktok";
import type { ContentPackage } from "./types";
import { renderVerticalVideo } from "./video";

const root = path.resolve("content-agent");
const outbox = path.join(root, "outbox");
const published = path.join(root, "published");
const stateFile = path.join(root, "state.json");
await Promise.all([mkdir(outbox, { recursive: true }), mkdir(published, { recursive: true })]);

async function state(): Promise<{ recentTopics: string[] }> {
  try { return JSON.parse(await readFile(stateFile, "utf8")); } catch { return { recentTopics: [] }; }
}
async function load(id: string) { return JSON.parse(await readFile(path.join(outbox, `${id}.json`), "utf8")) as ContentPackage; }
async function save(item: ContentPackage) { await writeFile(path.join(outbox, `${item.id}.json`), JSON.stringify(item, null, 2)); }

const [command, id] = process.argv.slice(2);
if (command === "generate") {
  const s = await state();
  const item = await generateContent(s.recentTopics);
  const audioPath = path.join(outbox, `${item.id}.mp3`);
  const videoPath = path.join(outbox, `${item.id}.mp4`);
  await createVoiceover(item.voiceover, audioPath);
  await renderVerticalVideo(audioPath, videoPath, item.hook, item.callToAction);
  item.videoPath = videoPath;
  await save(item);
  await writeFile(stateFile, JSON.stringify({ recentTopics: [item.topic, ...s.recentTopics].slice(0, 30) }, null, 2));
  console.log(JSON.stringify({ id: item.id, status: item.status, topic: item.topic }));
} else if (command === "approve" && id) {
  const item = await load(id); item.status = "approved"; await save(item); console.log(`Approved ${id}`);
} else if (command === "publish" && id) {
  const item = await load(id);
  if (item.status !== "approved") throw new Error("Content must be approved before upload");
  const errors = validateContent(item); if (errors.length) throw new Error(errors.join("; "));
  if (!item.videoPath) throw new Error("Approved package has no videoPath");
  item.publishId = await uploadTikTokDraft(item.videoPath); item.status = "published";
  await writeFile(path.join(published, `${id}.json`), JSON.stringify(item, null, 2));
  await rename(path.join(outbox, `${id}.json`), path.join(outbox, `${id}.published.json`)).catch(() => undefined);
  console.log(`Uploaded ${id} to TikTok inbox as ${item.publishId}`);
} else {
  throw new Error("Usage: npm run content:generate | npm run content:approve -- <id> | npm run content:publish -- <id>");
}
