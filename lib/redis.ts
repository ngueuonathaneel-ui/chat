/**
 * Client Redis - Pub/Sub Sessions & Real-time
 *
 * Architecture: Redis adapter pour Socket.IO horizontal scaling
 * Patterns: Pub/Sub cross-node, Session store, Rate limiting SLIDE window
 */

import { Redis } from "ioredis";

const globalForRedis = global as unknown as {
  redis: Redis;
  pub: Redis;
  sub: Redis;
};

// Client principal
export const redis =
  globalForRedis.redis ||
  new Redis(process.env.REDIS_URL || "redis://localhost:6379");

// Clients Pub/Sub pour Socket.IO adapter
export const pubClient =
  globalForRedis.pub ||
  new Redis(process.env.REDIS_URL || "redis://localhost:6379");
export const subClient =
  globalForRedis.sub ||
  new Redis(process.env.REDIS_URL || "redis://localhost:6379");

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
  globalForRedis.pub = pubClient;
  globalForRedis.sub = subClient;
}

// ─────────────────────────────────────────────
// Session Management
// ─────────────────────────────────────────────

const SESSION_PREFIX = "session:";
const SESSION_TTL = 24 * 60 * 60; // 24 heures

export async function createSession(
  userId: string,
  token: string,
): Promise<void> {
  await redis.setex(
    `${SESSION_PREFIX}${userId}:${token}`,
    SESSION_TTL,
    "valid",
  );
}

export async function invalidateSession(
  userId: string,
  token: string,
): Promise<void> {
  await redis.del(`${SESSION_PREFIX}${userId}:${token}`);
}

export async function invalidateAllUserSessions(userId: string): Promise<void> {
  const keys = await redis.keys(`${SESSION_PREFIX}${userId}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export async function isSessionValid(
  userId: string,
  token: string,
): Promise<boolean> {
  const exists = await redis.exists(`${SESSION_PREFIX}${userId}:${token}`);
  return exists === 1;
}

// ─────────────────────────────────────────────
// Rate Limiting - SLIDE Window avec Sorted Sets
//
// Algorithme: O(log n + m) pour zremrangebyscore
//           O(1) pour zcard, zadd, pexpire
// ─────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

export async function checkRateLimit(
  identifier: string,
  event: string,
  windowMs: number,
  maxRequests: number,
): Promise<RateLimitResult> {
  const key = `ratelimit:${identifier}:${event}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  // Pipeline Redis pour atomicité
  const pipeline = redis.pipeline();

  // 1. Supprimer les entrées hors fenêtre
  pipeline.zremrangebyscore(key, 0, windowStart);

  // 2. Compter les entrées actuelles
  pipeline.zcard(key);

  const results = await pipeline.exec();
  const currentCount = (results?.[1]?.[1] as number) || 0;

  if (currentCount >= maxRequests) {
    // Calculer le reset time (timestamp de l'entrée la plus ancienne + window)
    const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
    const resetTime =
      oldest.length > 0 ? parseInt(oldest[1]) + windowMs : now + windowMs;

    return {
      allowed: false,
      remaining: 0,
      resetTime,
    };
  }

  // 3. Ajouter l'entrée actuelle
  const score = now;
  const member = `${now}-${Math.random().toString(36).substr(2, 9)}`;

  await redis.zadd(key, score, member);
  await redis.pexpire(key, windowMs);

  return {
    allowed: true,
    remaining: maxRequests - currentCount - 1,
    resetTime: now + windowMs,
  };
}

// ─────────────────────────────────────────────
// Presence & Typing
// ─────────────────────────────────────────────

const PRESENCE_PREFIX = "presence:";
const TYPING_PREFIX = "typing:";
const PRESENCE_TTL = 60; // 1 minute
const TYPING_TTL = 5; // 5 secondes

export async function setUserPresence(
  userId: string,
  status: "online" | "away" | "offline" | "dnd",
  lastSeen?: Date,
): Promise<void> {
  const data = JSON.stringify({
    status,
    lastSeen: lastSeen?.toISOString() || new Date().toISOString(),
  });
  await redis.setex(`${PRESENCE_PREFIX}${userId}`, PRESENCE_TTL, data);
}

export async function getUserPresence(
  userId: string,
): Promise<{ status: string; lastSeen: string } | null> {
  const data = await redis.get(`${PRESENCE_PREFIX}${userId}`);
  return data ? JSON.parse(data) : null;
}

export async function setTyping(
  conversationId: string,
  userId: string,
): Promise<void> {
  await redis.setex(
    `${TYPING_PREFIX}${conversationId}:${userId}`,
    TYPING_TTL,
    Date.now().toString(),
  );
}

export async function getTypingUsers(
  conversationId: string,
): Promise<string[]> {
  const pattern = `${TYPING_PREFIX}${conversationId}:*`;
  const keys = await redis.keys(pattern);
  return keys.map((key) => key.split(":").pop()!).filter(Boolean);
}

// ─────────────────────────────────────────────
// Pub/Sub pour cross-node messaging
// ─────────────────────────────────────────────

export async function publishMessage(
  channel: string,
  message: unknown,
): Promise<void> {
  await pubClient.publish(channel, JSON.stringify(message));
}

export function subscribeToChannel(
  channel: string,
  handler: (message: unknown) => void,
): void {
  subClient.subscribe(channel, (err) => {
    if (err) console.error("Subscribe error:", err);
  });

  subClient.on("message", (receivedChannel, message) => {
    if (receivedChannel === channel) {
      try {
        handler(JSON.parse(message));
      } catch {
        console.error("Failed to parse message:", message);
      }
    }
  });
}
