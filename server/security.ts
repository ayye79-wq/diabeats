import type { NextFunction, Request, Response } from "express";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "./db";
import { aiUsage, appSessions } from "./schema";

const SESSION_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;
const AI_RATE_WINDOW_MS = 60 * 1000;
const AI_RATE_MAX_REQUESTS = 20;
const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;
const AUTH_RATE_MAX_REQUESTS = 20;
const PRODUCT_LOOKUP_RATE_WINDOW_MS = 60 * 1000;
const PRODUCT_LOOKUP_RATE_MAX_REQUESTS = 40;

type AiFeature = "ai" | "scan";

export interface SessionIdentity {
  id: string;
  isPremium: boolean;
  revenueCatUserId: string;
  usageKey: string;
}

declare global {
  namespace Express {
    interface Request {
      sessionIdentity?: SessionIdentity;
    }
  }
}

const requestBuckets = new Map<string, number[]>();

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be configured before accepting authenticated requests");
  }
  return secret;
}

function hashToken(token: string): string {
  return createHmac("sha256", getSessionSecret()).update(token).digest("hex");
}

function clientAddress(req: Request): string {
  // req.ip is normalized by Express using the loopback-only trust-proxy policy
  // in server/index.ts. This accepts Replit's local ingress hop but ignores a
  // forwarded header supplied by a direct, untrusted caller.
  return req.ip || req.socket.remoteAddress || "unknown";
}

function usageKeyForRequest(req: Request): string {
  return createHmac("sha256", getSessionSecret())
    .update(`usage:${clientAddress(req)}`)
    .digest("hex");
}

function isRateLimited(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const oldestAllowed = now - windowMs;
  const requests = (requestBuckets.get(key) ?? []).filter((time) => time > oldestAllowed);
  if (requests.length >= maxRequests) {
    requestBuckets.set(key, requests);
    return true;
  }
  requests.push(now);
  requestBuckets.set(key, requests);
  return false;
}

export function sessionCreationRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (isRateLimited(`session:${clientAddress(req)}`, AUTH_RATE_MAX_REQUESTS, AUTH_RATE_WINDOW_MS)) {
    res.setHeader("Retry-After", String(Math.ceil(AUTH_RATE_WINDOW_MS / 1000)));
    res.status(429).json({ error: "Too many session requests. Please try again later." });
    return;
  }
  next();
}

export function aiRateLimit(req: Request, res: Response, next: NextFunction): void {
  const sessionId = req.sessionIdentity?.id;
  if (!sessionId || isRateLimited(`ai:${sessionId}:${clientAddress(req)}`, AI_RATE_MAX_REQUESTS, AI_RATE_WINDOW_MS)) {
    res.setHeader("Retry-After", String(Math.ceil(AI_RATE_WINDOW_MS / 1000)));
    res.status(429).json({ error: "Too many AI requests. Please wait a minute and try again.", code: "rate_limited" });
    return;
  }
  next();
}

/**
 * Rate limits BioTrace product lookups/searches. These call the free Open Food
 * Facts public API (never OpenAI), so they get their own generous budget that is
 * independent from the AI quota. Requires an authenticated session.
 */
export function productLookupRateLimit(req: Request, res: Response, next: NextFunction): void {
  const sessionId = req.sessionIdentity?.id;
  if (
    !sessionId ||
    isRateLimited(
      `product:${sessionId}:${clientAddress(req)}`,
      PRODUCT_LOOKUP_RATE_MAX_REQUESTS,
      PRODUCT_LOOKUP_RATE_WINDOW_MS,
    )
  ) {
    res.setHeader("Retry-After", String(Math.ceil(PRODUCT_LOOKUP_RATE_WINDOW_MS / 1000)));
    res.status(429).json({
      error: "Too many product lookups. Please wait a moment and try again.",
      code: "rate_limited",
    });
    return;
  }
  next();
}

export async function createSession(
  req: Request,
): Promise<{ token: string; session: SessionIdentity; expiresAt: Date }> {
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const revenueCatUserId = `diabeats_${randomUUID()}`;
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  const usageKey = usageKeyForRequest(req);

  await db.insert(appSessions).values({
    id,
    tokenHash: hashToken(token),
    revenueCatUserId,
    usageKey,
    expiresAt,
  });

  return {
    token,
    session: { id, isPremium: false, revenueCatUserId, usageKey },
    expiresAt,
  };
}

export async function requireSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  if (!token || token.length > 512) {
    res.status(401).json({ error: "Authentication is required.", code: "authentication_required" });
    return;
  }

  try {
    const rows = await db
      .select({
        id: appSessions.id,
        isPremium: appSessions.isPremium,
        revenueCatUserId: appSessions.revenueCatUserId,
        usageKey: appSessions.usageKey,
      })
      .from(appSessions)
      .where(and(eq(appSessions.tokenHash, hashToken(token)), gt(appSessions.expiresAt, new Date())))
      .limit(1);

    const session = rows[0];
    if (!session) {
      res.status(401).json({ error: "Your session has expired. Please try again.", code: "session_expired" });
      return;
    }

    req.sessionIdentity = session;
    next();
  } catch (error) {
    console.error("Session validation failed:", error);
    res.status(503).json({ error: "Authentication is temporarily unavailable." });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_PASSWORD;
  const authorization = req.header("authorization");
  const provided = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

  if (
    !expected ||
    !provided ||
    expected.length !== provided.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
  ) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextUtcDaySeconds(): number {
  const now = new Date();
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((tomorrow - now.getTime()) / 1000));
}

export async function consumeAiQuota(
  req: Request,
  res: Response,
  feature: AiFeature,
  limit: number,
  premiumOnly = false,
): Promise<{ isPremium: boolean; usage: number; limit: number } | null> {
  const session = req.sessionIdentity;
  if (!session) {
    res.status(401).json({ error: "Authentication is required.", code: "authentication_required" });
    return null;
  }

  if (premiumOnly && !session.isPremium) {
    res.status(403).json({ error: "Premium access is required for this feature.", code: "premium_required" });
    return null;
  }

  if (session.isPremium) {
    return { isPremium: true, usage: 0, limit };
  }

  const date = todayUtc();
  const result = await db
    .insert(aiUsage)
    .values({ sessionId: session.id, usageKey: session.usageKey, usageDate: date, feature, count: 1 })
    .onConflictDoUpdate({
      target: [aiUsage.usageKey, aiUsage.usageDate, aiUsage.feature],
      set: { count: sql`${aiUsage.count} + 1` },
      where: sql`${aiUsage.count} < ${limit}`,
    })
    .returning({ count: aiUsage.count });

  const usage = result[0]?.count;
  if (usage === undefined) {
    const retryAfter = nextUtcDaySeconds();
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      error: `You have reached today's ${feature === "scan" ? "menu scan" : "AI question"} limit.`,
      code: "daily_limit",
      limit,
      retryAfter,
    });
    return null;
  }

  return { isPremium: false, usage, limit };
}