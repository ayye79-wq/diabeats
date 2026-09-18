import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  createTikTokAuthorizationUrl,
  exchangeTikTokAuthorizationCode,
  refreshTikTokAccessToken,
  type TikTokTokens,
} from "../content-agent/tiktok";
import { db } from "./db";
import { userEvents } from "./schema";

const OAUTH_STATE_EVENT = "tiktok_oauth_state";
const CONNECTION_EVENT = "tiktok_connection";
const UPLOAD_EVENT = "content_draft_tiktok_upload";
const CONNECTION_KEY = "primary";
const OAUTH_STATE_LIFETIME_MS = 10 * 60 * 1000;
const RESERVED_UPLOAD_STALE_MS = 2 * 60 * 1000;
const UNCERTAIN_UPLOAD_STALE_MS = 15 * 60 * 1000;
export const TIKTOK_REDIRECT_CALLBACK = "https://diabeatsapp.com/api/tiktok/callback";

type ConnectionRecord = TikTokTokens & { expiresAt: string };
export type TikTokUploadState = {
  status: "uploading" | "succeeded" | "failed";
  phase?: "reserved" | "transfer_started";
  publishId?: string;
  error?: string;
  updatedAt: string;
};
export type TikTokUploadResolution = "retry_reserved" | "confirm_not_in_inbox";

export class TikTokFlowError extends Error {
  constructor(
    public readonly code: "not_configured" | "not_connected" | "invalid_state" | "not_approved" | "duplicate_upload",
    message: string,
  ) {
    super(message);
    this.name = "TikTokFlowError";
  }
}

function clientConfig() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;
  if (!clientKey || !clientSecret || redirectUri !== TIKTOK_REDIRECT_CALLBACK) return null;
  return { clientKey, clientSecret, redirectUri };
}

function encryptionKey(): Buffer {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) throw new Error("SESSION_SECRET must be configured.");
  return createHash("sha256").update(`diabeats:tiktok:${sessionSecret}`).digest();
}

export function encryptTikTokRecord(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptTikTokRecord<T>(payload: string): T {
  const [iv, authTag, ciphertext, extra] = payload.split(".");
  if (!iv || !authTag || !ciphertext || extra) throw new Error("Stored TikTok credentials are unavailable.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8")) as T;
}

function parseUploadState(value: string | null): TikTokUploadState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<TikTokUploadState>;
    if (
      !parsed ||
      !["uploading", "succeeded", "failed"].includes(String(parsed.status)) ||
      typeof parsed.updatedAt !== "string"
    ) return null;
    return {
      status: parsed.status as TikTokUploadState["status"],
      ...(parsed.phase === "reserved" || parsed.phase === "transfer_started" ? { phase: parsed.phase } : {}),
      ...(typeof parsed.publishId === "string" ? { publishId: parsed.publishId } : {}),
      ...(typeof parsed.error === "string" ? { error: parsed.error } : {}),
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

async function latestEvent(event: string, itemId: string) {
  return (await db
    .select({ id: userEvents.id, metadata: userEvents.metadata, createdAt: userEvents.createdAt })
    .from(userEvents)
    .where(and(eq(userEvents.event, event), eq(userEvents.itemId, itemId)))
    .orderBy(desc(userEvents.id))
    .limit(1))[0] ?? null;
}

async function saveConnection(tokens: TikTokTokens): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
  const metadata = encryptTikTokRecord({ ...tokens, expiresAt } satisfies ConnectionRecord);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${CONNECTION_EVENT}))`);
    await tx.delete(userEvents).where(and(eq(userEvents.event, CONNECTION_EVENT), eq(userEvents.itemId, CONNECTION_KEY)));
    await tx.insert(userEvents).values({ event: CONNECTION_EVENT, itemId: CONNECTION_KEY, metadata });
  });
}

async function loadConnection(): Promise<ConnectionRecord | null> {
  const record = await latestEvent(CONNECTION_EVENT, CONNECTION_KEY);
  if (!record?.metadata) return null;
  try {
    const connection = decryptTikTokRecord<ConnectionRecord>(record.metadata);
    if (!connection.accessToken || !connection.expiresAt) return null;
    return connection;
  } catch {
    return null;
  }
}

export function getTikTokConnectionStatus() {
  const configured = Boolean(clientConfig());
  return loadConnection().then((connection) => ({
    configured,
    connected: Boolean(connection),
    expiresAt: connection?.expiresAt ?? null,
    scope: connection?.scope ?? null,
  }));
}

export async function startTikTokOAuth(): Promise<string> {
  const config = clientConfig();
  if (!config) {
    throw new TikTokFlowError("not_configured", "TikTok Sandbox is not configured yet.");
  }
  const state = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + OAUTH_STATE_LIFETIME_MS).toISOString();
  await db.insert(userEvents).values({
    event: OAUTH_STATE_EVENT,
    itemId: state,
    metadata: JSON.stringify({ expiresAt }),
  });
  return createTikTokAuthorizationUrl({ clientKey: config.clientKey, redirectUri: config.redirectUri, state });
}

async function consumeOauthState(state: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`oauth:${state}`}))`);
    const row = (await tx
      .select({ id: userEvents.id, metadata: userEvents.metadata })
      .from(userEvents)
      .where(and(eq(userEvents.event, OAUTH_STATE_EVENT), eq(userEvents.itemId, state)))
      .orderBy(desc(userEvents.id))
      .limit(1))[0];
    if (!row) throw new TikTokFlowError("invalid_state", "The TikTok authorization link is invalid or has already been used.");
    await tx.delete(userEvents).where(eq(userEvents.id, row.id));
    try {
      const metadata = JSON.parse(row.metadata ?? "{}") as { expiresAt?: string };
      if (!metadata.expiresAt || Date.parse(metadata.expiresAt) <= Date.now()) {
        throw new TikTokFlowError("invalid_state", "The TikTok authorization link has expired. Start again from Content Review.");
      }
    } catch (error) {
      if (error instanceof TikTokFlowError) throw error;
      throw new TikTokFlowError("invalid_state", "The TikTok authorization link is invalid.");
    }
  });
}

export async function completeTikTokOAuth(code: string, state: string): Promise<void> {
  const config = clientConfig();
  if (!config) throw new TikTokFlowError("not_configured", "TikTok Sandbox is not configured yet.");
  await consumeOauthState(state);
  const tokens = await exchangeTikTokAuthorizationCode({ ...config, code });
  await saveConnection(tokens);
}

export async function getTikTokAccessToken(): Promise<string> {
  const config = clientConfig();
  if (!config) throw new TikTokFlowError("not_configured", "TikTok Sandbox is not configured yet.");
  const existing = await loadConnection();
  if (!existing) throw new TikTokFlowError("not_connected", "Connect TikTok before uploading a draft.");
  if (Date.parse(existing.expiresAt) > Date.now() + 60_000) return existing.accessToken;
  if (!existing.refreshToken) throw new TikTokFlowError("not_connected", "Your TikTok connection expired. Connect TikTok again.");
  const refreshed = await refreshTikTokAccessToken({
    clientKey: config.clientKey,
    clientSecret: config.clientSecret,
    refreshToken: existing.refreshToken,
  });
  await saveConnection({ ...refreshed, refreshToken: refreshed.refreshToken ?? existing.refreshToken });
  return refreshed.accessToken;
}

export function assertTikTokUploadAllowed(
  draftStatus: string,
  existing: TikTokUploadState | null,
): void {
  if (draftStatus !== "approved") {
    throw new TikTokFlowError("not_approved", "Only approved drafts can be uploaded to TikTok Inbox.");
  }
  if (existing?.status === "succeeded") {
    throw new TikTokFlowError("duplicate_upload", "This draft has already been uploaded to TikTok Inbox.");
  }
  if (existing?.status === "uploading") {
    throw new TikTokFlowError("duplicate_upload", "This draft is already uploading to TikTok Inbox.");
  }
}

export async function uploadStatesByDraft(): Promise<Map<string, TikTokUploadState>> {
  const rows = await db
    .select({ itemId: userEvents.itemId, metadata: userEvents.metadata })
    .from(userEvents)
    .where(eq(userEvents.event, UPLOAD_EVENT))
    .orderBy(desc(userEvents.id));
  const states = new Map<string, TikTokUploadState>();
  for (const row of rows) {
    if (!row.itemId || states.has(row.itemId)) continue;
    const state = parseUploadState(row.metadata);
    if (state) states.set(row.itemId, state);
  }
  return states;
}

export async function beginTikTokUpload(draftId: string, draftStatus: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`upload:${draftId}`}))`);
    const current = (await tx
      .select({ metadata: userEvents.metadata })
      .from(userEvents)
      .where(and(eq(userEvents.event, UPLOAD_EVENT), eq(userEvents.itemId, draftId)))
      .orderBy(desc(userEvents.id))
      .limit(1))[0];
    assertTikTokUploadAllowed(draftStatus, parseUploadState(current?.metadata ?? null));
    await tx.insert(userEvents).values({
      event: UPLOAD_EVENT,
      itemId: draftId,
      metadata: JSON.stringify({ status: "uploading", phase: "reserved", updatedAt: new Date().toISOString() } satisfies TikTokUploadState),
    });
  });
}

export async function markTikTokTransferStarted(draftId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`upload:${draftId}`}))`);
    const current = (await tx
      .select({ metadata: userEvents.metadata })
      .from(userEvents)
      .where(and(eq(userEvents.event, UPLOAD_EVENT), eq(userEvents.itemId, draftId)))
      .orderBy(desc(userEvents.id))
      .limit(1))[0];
    const state = parseUploadState(current?.metadata ?? null);
    if (state?.status !== "uploading" || state.phase !== "reserved") {
      throw new TikTokFlowError("duplicate_upload", "This TikTok Inbox upload cannot be started again.");
    }
    await tx.insert(userEvents).values({
      event: UPLOAD_EVENT,
      itemId: draftId,
      metadata: JSON.stringify({
        status: "uploading",
        phase: "transfer_started",
        updatedAt: new Date().toISOString(),
      } satisfies TikTokUploadState),
    });
  });
}

export function canResolveTikTokUpload(
  existing: TikTokUploadState | null,
  action: TikTokUploadResolution,
  now = Date.now(),
): string {
  if (existing?.status !== "uploading") {
    throw new TikTokFlowError("duplicate_upload", "There is no interrupted TikTok upload to resolve.");
  }
  const age = now - Date.parse(existing.updatedAt);
  if (existing.phase === "reserved") {
    if (action !== "retry_reserved" || age < RESERVED_UPLOAD_STALE_MS) {
      throw new TikTokFlowError("duplicate_upload", "This TikTok upload is still being prepared. Refresh and try again later.");
    }
    return "The prior upload did not begin and is now available to retry.";
  }
  if (action !== "confirm_not_in_inbox" || age < UNCERTAIN_UPLOAD_STALE_MS) {
    throw new TikTokFlowError("duplicate_upload", "TikTok may have received this video. Check TikTok Inbox before resolving it.");
  }
  return "Manually cleared after confirming the video is not in TikTok Inbox.";
}

export async function resolveTikTokUpload(
  draftId: string,
  action: TikTokUploadResolution,
): Promise<TikTokUploadState> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`upload:${draftId}`}))`);
    const current = (await tx
      .select({ metadata: userEvents.metadata })
      .from(userEvents)
      .where(and(eq(userEvents.event, UPLOAD_EVENT), eq(userEvents.itemId, draftId)))
      .orderBy(desc(userEvents.id))
      .limit(1))[0];
    const message = canResolveTikTokUpload(parseUploadState(current?.metadata ?? null), action);
    const state: TikTokUploadState = { status: "failed", error: message, updatedAt: new Date().toISOString() };
    await tx.insert(userEvents).values({
      event: UPLOAD_EVENT,
      itemId: draftId,
      metadata: JSON.stringify(state),
    });
    return state;
  });
}

export async function finishTikTokUpload(
  draftId: string,
  outcome: { publishId: string } | { error: string },
): Promise<TikTokUploadState> {
  const state: TikTokUploadState = "publishId" in outcome
    ? { status: "succeeded", publishId: outcome.publishId, updatedAt: new Date().toISOString() }
    : { status: "failed", error: outcome.error.slice(0, 240), updatedAt: new Date().toISOString() };
  await db.insert(userEvents).values({
    event: UPLOAD_EVENT,
    itemId: draftId,
    metadata: JSON.stringify(state),
  });
  return state;
}