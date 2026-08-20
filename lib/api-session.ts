import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch } from "expo/fetch";

const SESSION_KEY = "@diabeats_api_session_v1";
const SESSION_RENEWAL_MARGIN_MS = 5 * 60 * 1000;

export interface ApiSession {
  origin: string;
  token: string;
  revenueCatUserId: string;
  expiresAt: number;
}

let pendingSession: Promise<ApiSession> | null = null;

function normalizedOrigin(baseUrl: string): string {
  return new URL(baseUrl).origin;
}

async function loadStoredSession(origin: string): Promise<ApiSession | null> {
  try {
    const stored = await AsyncStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    const session = JSON.parse(stored) as ApiSession;
    const isCurrent =
      session.origin === origin &&
      typeof session.token === "string" &&
      typeof session.revenueCatUserId === "string" &&
      typeof session.expiresAt === "number" &&
      session.expiresAt > Date.now() + SESSION_RENEWAL_MARGIN_MS;
    if (!isCurrent) {
      await AsyncStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

async function createSession(baseUrl: string): Promise<ApiSession> {
  const origin = normalizedOrigin(baseUrl);
  const response = await fetch(new URL("/api/auth/session", baseUrl).toString(), { method: "POST" });
  if (!response.ok) {
    throw new Error("Could not establish a secure app session. Please try again.");
  }

  const body = (await response.json()) as { token?: string; revenueCatUserId?: string; expiresAt?: string };
  const expiresAt = body.expiresAt ? new Date(body.expiresAt).getTime() : Number.NaN;
  if (!body.token || !body.revenueCatUserId || !Number.isFinite(expiresAt)) {
    throw new Error("The server returned an invalid app session.");
  }

  const session: ApiSession = { origin, token: body.token, revenueCatUserId: body.revenueCatUserId, expiresAt };
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function getApiSession(baseUrl: string): Promise<ApiSession> {
  const origin = normalizedOrigin(baseUrl);
  const existing = await loadStoredSession(origin);
  if (existing) return existing;

  if (!pendingSession) {
    pendingSession = createSession(baseUrl).finally(() => {
      pendingSession = null;
    });
  }
  return pendingSession;
}

export async function clearApiSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}