import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ContentDraftStoreError, createContentDraftStore } from "./drafts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createStore() {
  const root = await mkdtemp(path.join(os.tmpdir(), "diabeats-content-drafts-"));
  temporaryDirectories.push(root);
  const outbox = path.join(root, "outbox");
  await mkdir(outbox);
  return { outbox, store: createContentDraftStore(root) };
}

function draft(id: string, status: "draft" | "approved" = "draft") {
  return {
    id,
    createdAt: "2026-08-21T12:00:00.000Z",
    status,
    topic: "Restaurant menu questions",
    featureIds: ["menu-item-information"],
    featureClaims: [{ featureId: "menu-item-information", claim: "View restaurant menu-item details and nutrition information." }],
    hook: "One menu question to ask",
    voiceover: "Restaurant nutrition can vary. Review the available information and confirm ingredients before ordering.",
    scenes: [
      { seconds: 4, onScreenText: "Check the menu", visual: "menu" },
      { seconds: 4, onScreenText: "Confirm ingredients", visual: "ingredients" },
      { seconds: 4, onScreenText: "Use your plan", visual: "phone" },
    ],
    caption: "A cautious menu-review reminder.",
    hashtags: ["#DiabEats", "#DiabetesEducation"],
    disclaimer: "General education only - not medical advice.",
    callToAction: "Explore DiabEats",
  };
}

test("lists only valid content draft files and reports controlled video availability", async () => {
  const { outbox, store } = await createStore();
  await writeFile(path.join(outbox, "20260821120000-demo1.json"), JSON.stringify(draft("20260821120000-demo1")));
  await writeFile(path.join(outbox, "20260821120000-demo1.mp4"), "mock video");
  await writeFile(path.join(outbox, "not-a-draft.json"), JSON.stringify({ unexpected: true }));
  await writeFile(path.join(outbox, "20260821120000-broken.json"), "{not valid json");
  await writeFile(path.join(outbox, "20260821120000-demo1.published.json"), JSON.stringify(draft("20260821120000-demo1", "approved")));

  const drafts = await store.list();

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].id, "20260821120000-demo1");
  assert.equal(drafts[0].hasVideo, true);
  assert.equal("videoPath" in drafts[0], false);
});

test("approves a draft once and refuses repeat approvals", async () => {
  const { outbox, store } = await createStore();
  const id = "20260821120000-demo2";
  await writeFile(path.join(outbox, `${id}.json`), JSON.stringify(draft(id)));

  const approved = await store.approve(id);

  assert.equal(approved.status, "approved");
  await assert.rejects(
    () => store.approve(id),
    (error: unknown) => error instanceof ContentDraftStoreError && error.code === "not_approvable",
  );
});

test("allows only one simultaneous approval for the same draft", async () => {
  const { outbox, store } = await createStore();
  const id = "20260821120000-demo3";
  await writeFile(path.join(outbox, `${id}.json`), JSON.stringify(draft(id)));

  const results = await Promise.allSettled([store.approve(id), store.approve(id)]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected");
  assert.ok(rejected.reason instanceof ContentDraftStoreError);
  assert.equal(rejected.reason.code, "not_approvable");
});

test("recovers a stale approval lock after an interrupted approval", async () => {
  const { outbox, store } = await createStore();
  const id = "20260821120000-demo4";
  const claim = path.join(outbox, `${id}.approval-interrupted.json`);
  await writeFile(claim, JSON.stringify(draft(id)));
  const staleTime = new Date(Date.now() - 6 * 60 * 1000);
  await utimes(claim, staleTime, staleTime);

  const approved = await store.approve(id);

  assert.equal(approved.status, "approved");
});

test("does not take over a fresh approval claim", async () => {
  const { outbox, store } = await createStore();
  const id = "20260821120000-demo5";
  await writeFile(path.join(outbox, `${id}.approval-active.json`), JSON.stringify(draft(id)));

  await assert.rejects(
    () => store.approve(id),
    (error: unknown) => error instanceof ContentDraftStoreError && error.code === "not_approvable",
  );
});

test("does not list a shape-conforming draft that fails canonical safety validation", async () => {
  const { outbox, store } = await createStore();
  const invalid = {
    ...draft("20260821120000-unsafe"),
    featureIds: ["not-a-real-feature"],
    featureClaims: [{ featureId: "not-a-real-feature", claim: "An unsupported claim." }],
  };
  await writeFile(path.join(outbox, "20260821120000-unsafe.json"), JSON.stringify(invalid));

  assert.deepEqual(await store.list(), []);
});

test("rejects path traversal IDs and does not resolve them to video files", async () => {
  const { store } = await createStore();

  await assert.rejects(
    () => store.getVideoPath("../state"),
    (error: unknown) => error instanceof ContentDraftStoreError && error.code === "invalid_id",
  );
});

test("lists versioned review packages when an outbox is not available", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "diabeats-versioned-review-drafts-"));
  temporaryDirectories.push(root);
  const reviewDrafts = path.join(root, "review-drafts");
  const id = "20260821120000-review1";
  await mkdir(reviewDrafts);
  await writeFile(path.join(reviewDrafts, `${id}.json`), JSON.stringify(draft(id)));
  await writeFile(path.join(reviewDrafts, `${id}.mp4`), "review video");

  const store = createContentDraftStore(root);
  const drafts = await store.list();

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].id, id);
  assert.equal(drafts[0].hasVideo, true);
  assert.equal(await store.getVideoPath(id), path.join(reviewDrafts, `${id}.mp4`));
});

test("prefers a browser-compatible preview sidecar while retaining the MP4 upload path", async () => {
  const { outbox, store } = await createStore();
  const id = "20260821120000-preview1";
  await writeFile(path.join(outbox, `${id}.json`), JSON.stringify(draft(id)));
  await writeFile(path.join(outbox, `${id}.mp4`), "tiktok upload video");
  await writeFile(path.join(outbox, `${id}.webm`), "browser preview video");

  assert.equal(await store.getVideoPath(id), path.join(outbox, `${id}.mp4`));
  assert.equal(await store.getPreviewPath(id), path.join(outbox, `${id}.webm`));
});