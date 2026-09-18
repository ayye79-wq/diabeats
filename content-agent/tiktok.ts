import { readFile } from "node:fs/promises";

const API = "https://open.tiktokapis.com";
const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";

export const TIKTOK_UPLOAD_SCOPE = "video.upload";

export class TikTokApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TikTokApiError";
  }
}

export type TikTokTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  openId: string | null;
  scope: string | null;
};

type Fetcher = typeof fetch;

function requireText(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TikTokApiError(message);
  return value;
}

function parseTokens(value: unknown): TikTokTokens {
  const body = value as Record<string, unknown> | null;
  const accessToken = requireText(body?.access_token, "TikTok did not return an access token.");
  const expiresIn = Number(body?.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new TikTokApiError("TikTok did not return a valid token expiry.");
  }
  return {
    accessToken,
    refreshToken: typeof body?.refresh_token === "string" && body.refresh_token ? body.refresh_token : null,
    expiresIn,
    openId: typeof body?.open_id === "string" && body.open_id ? body.open_id : null,
    scope: typeof body?.scope === "string" && body.scope ? body.scope : null,
  };
}

async function tokenRequest(
  params: URLSearchParams,
  fetcher: Fetcher = fetch,
): Promise<TikTokTokens> {
  const response = await fetcher(`${API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!response.ok) {
    throw new TikTokApiError(`TikTok authorization failed (${response.status}).`);
  }
  return parseTokens(await response.json());
}

export function createTikTokAuthorizationUrl(input: {
  clientKey: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_key", input.clientKey);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", TIKTOK_UPLOAD_SCOPE);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeTikTokAuthorizationCode(
  input: { clientKey: string; clientSecret: string; redirectUri: string; code: string },
  fetcher: Fetcher = fetch,
): Promise<TikTokTokens> {
  return tokenRequest(
    new URLSearchParams({
      client_key: input.clientKey,
      client_secret: input.clientSecret,
      code: input.code,
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri,
    }),
    fetcher,
  );
}

export async function refreshTikTokAccessToken(
  input: { clientKey: string; clientSecret: string; refreshToken: string },
  fetcher: Fetcher = fetch,
): Promise<TikTokTokens> {
  return tokenRequest(
    new URLSearchParams({
      client_key: input.clientKey,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    }),
    fetcher,
  );
}

export async function uploadTikTokDraft(
  videoPath: string,
  accessToken = process.env.TIKTOK_ACCESS_TOKEN,
  fetcher: Fetcher = fetch,
) {
  const token = accessToken;
  if (!token) throw new Error("TIKTOK_ACCESS_TOKEN is not configured");
  const bytes = await readFile(videoPath);
  const init = await fetcher(`${API}/v2/post/publish/inbox/video/init/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ source_info: { source: "FILE_UPLOAD", video_size: bytes.length, chunk_size: bytes.length, total_chunk_count: 1 } }),
  });
  if (!init.ok) throw new TikTokApiError(`TikTok upload initialization failed (${init.status}).`);
  const payload = await init.json() as { data?: { publish_id?: string; upload_url?: string }; error?: { message?: string } };
  if (!payload.data?.upload_url || !payload.data.publish_id) {
    throw new TikTokApiError("TikTok did not return an upload destination.");
  }
  const uploaded = await fetcher(payload.data.upload_url, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes.length), "Content-Range": `bytes 0-${bytes.length - 1}/${bytes.length}` }, body: bytes });
  if (!uploaded.ok) throw new TikTokApiError(`TikTok media transfer failed (${uploaded.status}).`);
  return payload.data.publish_id;
}
