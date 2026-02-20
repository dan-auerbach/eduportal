/**
 * C7: Centralized rate limiter with Upstash Redis + in-memory fallback.
 *
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL is configured (works cross-instance
 * on Vercel serverless). Falls back to in-memory for local development or if Redis
 * is not configured.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ── Types ────────────────────────────────────────────────────────────────────

type RateLimitResult = {
  success: boolean;
  remaining: number;
  resetAt: number;
};

// ── Upstash Redis (if configured) ────────────────────────────────────────────

let upstashRedis: Redis | null = null;

function getRedis(): Redis | null {
  if (upstashRedis) return upstashRedis;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    upstashRedis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    return upstashRedis;
  }
  return null;
}

// Cache of Ratelimit instances (keyed by "limit:windowSec")
const rlCache = new Map<string, Ratelimit>();

function getUpstashRateLimiter(limit: number, windowSec: number): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;

  const key = `${limit}:${windowSec}`;
  let rl = rlCache.get(key);
  if (!rl) {
    rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      analytics: false,
    });
    rlCache.set(key, rl);
  }
  return rl;
}

// ── In-memory fallback ───────────────────────────────────────────────────────

type MemEntry = { count: number; resetAt: number };
const memStore = new Map<string, MemEntry>();
let lastCleanup = Date.now();

function memCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [k, entry] of memStore) {
    if (entry.resetAt < now) memStore.delete(k);
  }
}

function memRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  memCleanup();
  const now = Date.now();
  const entry = memStore.get(key);

  if (!entry || entry.resetAt < now) {
    memStore.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  entry.count++;
  if (entry.count > limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }
  return { success: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Check rate limit for a given key.
 * Uses Upstash Redis if configured, otherwise in-memory.
 *
 * @param key - unique identifier (e.g., "chat:userId" or "login:email")
 * @param limit - max requests per window
 * @param windowMs - time window in milliseconds
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const windowSec = Math.ceil(windowMs / 1000);
  const upstash = getUpstashRateLimiter(limit, windowSec);

  if (upstash) {
    try {
      const result = await upstash.limit(key);
      return {
        success: result.success,
        remaining: result.remaining,
        resetAt: result.reset,
      };
    } catch {
      // Redis error — fall back to in-memory
      return memRateLimit(key, limit, windowMs);
    }
  }

  return memRateLimit(key, limit, windowMs);
}

// ── Pre-configured rate limiters (C8) ────────────────────────────────────────

/** Chat message: 10 per 60s per user */
export async function rateLimitChatMessage(userId: string): Promise<RateLimitResult> {
  return rateLimit(`chat:msg:${userId}`, 10, 60_000);
}

/** Chat topic: 3 per 60s per user */
export async function rateLimitChatTopic(userId: string): Promise<RateLimitResult> {
  return rateLimit(`chat:topic:${userId}`, 3, 60_000);
}

/** Confirm/unconfirm answer: 10 per 60s per user */
export async function rateLimitConfirmAnswer(userId: string): Promise<RateLimitResult> {
  return rateLimit(`chat:confirm:${userId}`, 10, 60_000);
}

/** Chat polling (GET): 30 per 60s per user */
export async function rateLimitChatPoll(userId: string): Promise<RateLimitResult> {
  return rateLimit(`chat:poll:${userId}`, 30, 60_000);
}

/** Login attempts: 5 per 15 min per email */
export async function rateLimitLogin(email: string): Promise<RateLimitResult> {
  return rateLimit(`login:${email.toLowerCase()}`, 5, 15 * 60_000);
}

/** Radar post creation: 5 per day per user */
export async function rateLimitRadarPost(userId: string): Promise<RateLimitResult> {
  return rateLimit(`radar:post:${userId}`, 5, 24 * 60 * 60_000);
}

/** AI module build: 50 per hour per user (relaxed for testing) */
export async function rateLimitAiBuild(userId: string): Promise<RateLimitResult> {
  return rateLimit(`ai:build:${userId}`, 50, 60 * 60_000);
}

/** AI editor actions (metadata, tags, quiz, image): 30 per hour per user */
export async function rateLimitAiEditor(userId: string): Promise<RateLimitResult> {
  return rateLimit(`ai:editor:${userId}`, 30, 60 * 60_000);
}

/** Knowledge suggestion vote: 30 per 60s per user */
export async function rateLimitSuggestionVote(userId: string): Promise<RateLimitResult> {
  return rateLimit(`suggest:vote:${userId}`, 30, 60_000);
}

/** Knowledge suggestion creation: 5 per hour per user */
export async function rateLimitSuggestionCreate(userId: string): Promise<RateLimitResult> {
  return rateLimit(`suggest:create:${userId}`, 5, 60 * 60_000);
}

/** Reward redemption: 5 per minute per user */
export async function rateLimitRedemption(userId: string): Promise<RateLimitResult> {
  return rateLimit(`reward:redeem:${userId}`, 5, 60_000);
}

/** Presence heartbeat: 4 per 60s per user */
export async function rateLimitPresencePing(userId: string): Promise<RateLimitResult> {
  return rateLimit(`presence:ping:${userId}`, 4, 60_000);
}

/** Presence online list: 10 per 60s per user */
export async function rateLimitPresenceList(userId: string): Promise<RateLimitResult> {
  return rateLimit(`presence:list:${userId}`, 10, 60_000);
}

/** Chat SSE stream: 6 per 60s per user */
export async function rateLimitChatSSE(userId: string): Promise<RateLimitResult> {
  return rateLimit(`chat:sse:${userId}`, 6, 60_000);
}
