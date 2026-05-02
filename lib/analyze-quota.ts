/**
 * Daily analyze quota per client IP (UTC calendar day).
 *
 * - Default: in-memory (works for single dev server; resets on restart).
 * - Production (multi-instance): set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN and run `npm install @upstash/redis`.
 */

const MEMORY = new Map<string, number>();

let redisPromise: Promise<Awaited<ReturnType<typeof createRedis>> | null> | undefined;

async function createRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = await import("@upstash/redis");
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

async function getRedis() {
  if (!redisPromise) redisPromise = createRedis();
  return redisPromise;
}

export function isQuotaDisabled(): boolean {
  const v = process.env.ANALYZE_LIMIT_DISABLED ?? "";
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

export function getDailyLimit(): number {
  if (isQuotaDisabled()) return Number.POSITIVE_INFINITY;
  const raw = process.env.ANALYZE_DAILY_LIMIT ?? "20";
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 20;
  return Math.min(10000, n);
}

export function utcDayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function secondsUntilUtcMidnight(): number {
  const now = Date.now();
  const next = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(60, Math.floor((next - now) / 1000));
}

function storageKey(ip: string, day: string): string {
  return `sap-health:analyze:${day}:${ip}`;
}

export function getClientIp(headers: Headers): string {
  const xf = headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real?.trim()) return real.trim();
  return "unknown";
}

export async function getQuotaState(ip: string): Promise<{
  limit: number;
  used: number;
  remaining: number;
  resetsInSeconds: number;
  unlimited: boolean;
}> {
  const limit = getDailyLimit();
  const day = utcDayKey();
  const key = storageKey(ip, day);

  if (limit === Number.POSITIVE_INFINITY) {
    return {
      limit: Number.POSITIVE_INFINITY,
      used: 0,
      remaining: Number.POSITIVE_INFINITY,
      resetsInSeconds: secondsUntilUtcMidnight(),
      unlimited: true,
    };
  }

  const redis = await getRedis();
  let used = 0;

  if (redis) {
    const raw = await redis.get<string>(key);
    used = raw ? parseInt(String(raw), 10) || 0 : 0;
  } else {
    used = MEMORY.get(key) ?? 0;
  }

  const remaining = Math.max(0, limit - used);
  return {
    limit,
    used,
    remaining,
    resetsInSeconds: secondsUntilUtcMidnight(),
    unlimited: false,
  };
}

export async function consumeAnalyzeQuota(ip: string): Promise<{ count: number; limit: number }> {
  const limit = getDailyLimit();
  if (limit === Number.POSITIVE_INFINITY) {
    return { count: 0, limit: Number.POSITIVE_INFINITY };
  }

  const day = utcDayKey();
  const key = storageKey(ip, day);
  const ttl = secondsUntilUtcMidnight();

  const redis = await getRedis();
  if (redis) {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, ttl);
    }
    return { count, limit };
  }

  const prev = MEMORY.get(key) ?? 0;
  const next = prev + 1;
  MEMORY.set(key, next);
  return { count: next, limit };
}

export async function assertQuotaAllows(ip: string): Promise<
  | { ok: true }
  | { ok: false; remaining: number; limit: number; resetsInSeconds: number }
> {
  const state = await getQuotaState(ip);
  if (state.unlimited) return { ok: true };
  if (state.remaining <= 0) {
    return {
      ok: false,
      remaining: 0,
      limit: state.limit,
      resetsInSeconds: state.resetsInSeconds,
    };
  }
  return { ok: true };
}
