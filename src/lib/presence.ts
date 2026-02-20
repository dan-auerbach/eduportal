/**
 * Redis-based presence store for online user tracking.
 * Uses Upstash REST Redis with TTL-based auto-expiry.
 * Silent no-op fallback when Redis is not configured.
 */

import { Redis } from "@upstash/redis";

const PRESENCE_TTL = 90; // seconds — keys expire if no heartbeat
const PRESENCE_PREFIX = "presence:";

// ── Redis singleton (same pattern as rate-limit.ts) ──────────────────────────

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    return redis;
  }
  return null;
}

function presenceKey(tenantId: string, userId: string): string {
  return `${PRESENCE_PREFIX}${tenantId}:${userId}`;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type PresenceData = {
  userId: string;
  displayName: string;
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Set/refresh presence for a user. TTL auto-expires after PRESENCE_TTL seconds.
 */
export async function setPresence(
  tenantId: string,
  data: PresenceData,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    const key = presenceKey(tenantId, data.userId);
    await r.set(key, JSON.stringify(data), { ex: PRESENCE_TTL });
  } catch {
    // Redis failure — silently ignore
  }
}

/**
 * Get all online users for a tenant via SCAN + MGET.
 * Returns up to `limit` users.
 */
export async function getOnlineUsers(
  tenantId: string,
  limit: number = 30,
): Promise<PresenceData[]> {
  const r = getRedis();
  if (!r) return [];

  try {
    const pattern = `${PRESENCE_PREFIX}${tenantId}:*`;
    const results: PresenceData[] = [];
    let cursor = 0;

    do {
      const [nextCursor, keys] = await r.scan(cursor, {
        match: pattern,
        count: 100,
      });
      cursor = typeof nextCursor === "number" ? nextCursor : Number(nextCursor);

      if (keys.length > 0) {
        const values = await r.mget<(string | null)[]>(...keys);
        for (const val of values) {
          if (val && results.length < limit) {
            try {
              const parsed = typeof val === "string" ? JSON.parse(val) : val;
              if (parsed && typeof parsed === "object" && "userId" in parsed) {
                results.push(parsed as PresenceData);
              }
            } catch {
              // skip malformed entries
            }
          }
        }
      }
    } while (cursor !== 0 && results.length < limit);

    return results;
  } catch {
    return [];
  }
}
