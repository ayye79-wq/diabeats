import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  TikTokApiError,
  TIKTOK_UPLOAD_SCOPE,
  createTikTokAuthorizationUrl,
  exchangeTikTokAuthorizationCode,
  refreshTikTokAccessToken,
  uploadTikTokDraft,
} from "./tiktok";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test("creates an authorization URL with only the TikTok Inbox upload scope", () => {
  const url = new URL(createTikTokAuthorizationUrl({
    clientKey: "client-key",
    redirectUri: "https://diabeatsapp.com/api/tiktok/callback",
    state: "state-value",
  }));

  assert.equal(url.origin, "https://www.tiktok.com");
  assert.equal(url.searchParams.get("scope"), TIKTOK_UPLOAD_SCOPE);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_key"), "client-key");
  assert.equal(url.searchParams.get("redirect_uri"), "https://diabeatsapp.com/api/tiktok/callback");
  assert.equal(url.searchParams.get("state"), "state-value");
  assert.equal(url.searchParams.has("client_secret"), false);
});

test("exchanges and refreshes tokens through injected fetch without real network access", async () => {
  const requests: Array<{ url: string; body: string }> = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), body: String(init?.body ?? "") });
    return new Response(JSON.stringify({
      access_token: requests.length === 1 ? "access-one" : "access-two",
      refresh_token: "refresh-token",
      expires_in: 3600,
      open_id: "open-id",
      scope: "video.upload",
    }), { status: 200 });
  };

  const exchange = await exchangeTikTokAuthorizationCode({
    clientKey: "client-key",
    clientSecret: "client-secret",
    redirectUri: "https://diabeatsapp.com/api/tiktok/callback",
    code: "authorization-code",
  }, fetcher as typeof fetch);
  const refresh = await refreshTikTokAccessToken({
    clientKey: "client-key",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
  }, fetcher as typeof fetch);

  assert.equal(exchange.accessToken, "access-one");
  assert.equal(refresh.accessToken, "access-two");
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /\/v2\/oauth\/token\/$/);
  assert.match(requests[0].body, /grant_type=authorization_code/);
  assert.match(requests[0].body, /client_secret=client-secret/);
  assert.match(requests[1].body, /grant_type=refresh_token/);
});

test("uploads to Inbox through a mocked transfer and never falls back to a real token", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "diabeats-tiktok-upload-"));
  temporaryDirectories.push(directory);
  const videoPath = path.join(directory, "review.mp4");
  await writeFile(videoPath, "mock-video");

  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    if (requests.length === 1) {
      return new Response(JSON.stringify({
        data: { publish_id: "publish-123", upload_url: "https://upload.example/video" },
      }), { status: 200 });
    }
    return new Response("", { status: 200 });
  };

  const publishId = await uploadTikTokDraft(videoPath, "server-only-token", fetcher as typeof fetch);

  assert.equal(publishId, "publish-123");
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /\/v2\/post\/publish\/inbox\/video\/init\/$/);
  assert.equal((requests[0].init?.headers as Record<string, string>).Authorization, "Bearer server-only-token");
  assert.equal(requests[1].init?.method, "PUT");
});

test("returns a safe upload error without exposing a provider response", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "diabeats-tiktok-failure-"));
  temporaryDirectories.push(directory);
  const videoPath = path.join(directory, "review.mp4");
  await writeFile(videoPath, "mock-video");

  await assert.rejects(
    () => uploadTikTokDraft(videoPath, "server-only-token", async () =>
      new Response("access_token=should-not-leak", { status: 401 }),
    ),
    (error: unknown) =>
      error instanceof TikTokApiError &&
      error.message === "TikTok upload initialization failed (401)." &&
      !error.message.includes("should-not-leak"),
  );
});

test("does not expose a provider-controlled logical error message", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "diabeats-tiktok-logical-error-"));
  temporaryDirectories.push(directory);
  const videoPath = path.join(directory, "review.mp4");
  await writeFile(videoPath, "mock-video");

  await assert.rejects(
    () => uploadTikTokDraft(videoPath, "server-only-token", async () =>
      new Response(JSON.stringify({ error: { message: "access_token=should-not-leak" } }), { status: 200 }),
    ),
    (error: unknown) =>
      error instanceof TikTokApiError &&
      error.message === "TikTok did not return an upload destination." &&
      !error.message.includes("should-not-leak"),
  );
});