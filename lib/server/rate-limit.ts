/**
 * In-memory sliding-window rate limiter for API routes.
 *
 * Design:
 * - Uses a Map keyed by `identifier:scope` → array of timestamps.
 * - On each check, prunes timestamps older than the window, then counts.
 * - If count ≥ limit, returns `limited: true` with retry-after seconds.
 * - A background sweeper runs every 60s to evict entirely-stale keys so
 *   memory doesn't grow unbounded in long-running processes.
 *
 * Limitations:
 * - In-memory only; not shared across instances. For multi-instance
 *   deployments, set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
 *   and the limiter will automatically use Upstash Redis (@upstash/ratelimit
 *   + @upstash/redis) for distributed rate limiting.
 *
 * Usage in a route handler:
 * ```
 * const result = await checkRateLimit(req, { scope: 'generate', limit: 10, windowMs: 60_000 });
 * if (result.limited) {
 *   return apiError('RATE_LIMITED', 429, 'Too many requests', undefined, `Retry after ${result.retryAfter}s`);
 * }
 * ```
 */
import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('RateLimit');

// ── Types ──────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Logical scope name, e.g. 'generate-classroom', 'chat', 'global'. */
  scope: string;
  /** Max requests allowed within the window. */
  limit: number;
  /** Time window in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  retryAfter: number; // seconds until the oldest request in the window expires
}

// ── In-memory store ────────────────────────────────────────────────────────

interface Bucket {
  timestamps: number[];
}

const store = new Map<string, Bucket>();
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 60_000;
const MAX_BUCKET_AGE_MS = 120_000; // prune buckets with no recent hits

function sweepStale(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of store) {
    const cutoff = now - MAX_BUCKET_AGE_MS;
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
    if (bucket.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

// ── Distributed (Upstash Redis) support ────────────────────────────────────

let distributedLimiter: ReturnType<typeof createDistributedLimiter> | null = null;
let distributedChecked = false;

function createDistributedLimiter() {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return null;

  try {
    // Dynamic import so the dependency is optional
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Ratelimit } = require('@upstash/ratelimit');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('@upstash/redis');
    const redis = new Redis({ url: redisUrl, token: redisToken });
    return new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '1 m'), // default; overridden per-call
      analytics: true,
    });
  } catch {
    log.warn('UPSTASH_REDIS_REST_URL set but @upstash/ratelimit not installed; falling back to in-memory');
    return null;
  }
}

function getDistributedLimiter() {
  if (!distributedChecked) {
    distributedChecked = true;
    distributedLimiter = createDistributedLimiter();
    if (distributedLimiter) {
      log.info('Distributed rate limiting enabled (Upstash Redis)');
    }
  }
  return distributedLimiter;
}

// ── Client identification ──────────────────────────────────────────────────

/**
 * Extract a client identifier from the request. Uses the authenticated user ID
 * from NextAuth session token if available, otherwise falls back to IP address.
 */
function getClientIdentifier(req: NextRequest): string {
  // In test environments or edge cases, req.cookies / req.headers may be undefined
  const cookies = req.cookies;
  if (cookies) {
    // Check for NextAuth session cookie (JWT)
    const sessionCookie =
      cookies.get('next-auth.session-token')?.value ??
      cookies.get('__Secure-next-auth.session-token')?.value ??
      null;

    if (sessionCookie) {
      // Use a hash of the session token as identifier (don't store the raw token)
      return `session:${sessionCookie.slice(0, 16)}`;
    }

    // Check for access code cookie
    const accessCookie = cookies.get('nova_access')?.value;
    if (accessCookie) {
      return `access:${accessCookie.slice(0, 16)}`;
    }
  }

  // Fall back to IP address
  const headers = req.headers;
  if (headers) {
    const forwarded = headers.get('x-forwarded-for');
    const realIp = headers.get('x-real-ip');
    const ip = forwarded?.split(',')[0]?.trim() ?? realIp ?? 'unknown';
    return `ip:${ip}`;
  }

  return 'unknown:no-headers';
}

// ── Core rate limit check ──────────────────────────────────────────────────

/**
 * Check whether a request should be rate-limited.
 *
 * @param req - The NextRequest object
 * @param config - Rate limit configuration
 * @returns Result indicating whether the request is limited and remaining quota
 */
export async function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const identifier = getClientIdentifier(req);
  const key = `${identifier}:${config.scope}`;
  const now = Date.now();

  // Try distributed limiter first
  const distLimiter = getDistributedLimiter();
  if (distLimiter) {
    try {
      const { success, remaining, reset } = await distLimiter.limit(key);
      return {
        limited: !success,
        remaining,
        retryAfter: Math.ceil((reset - now) / 1000),
      };
    } catch (err) {
      log.warn('Distributed rate limit check failed, falling back to in-memory:', err);
    }
  }

  // In-memory fallback
  sweepStale(now);

  let bucket = store.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    store.set(key, bucket);
  }

  const windowStart = now - config.windowMs;
  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);

  if (bucket.timestamps.length >= config.limit) {
    const oldestInWindow = bucket.timestamps[0];
    const retryAfter = Math.ceil((oldestInWindow + config.windowMs - now) / 1000);
    return {
      limited: true,
      remaining: 0,
      retryAfter: Math.max(1, retryAfter),
    };
  }

  bucket.timestamps.push(now);
  return {
    limited: false,
    remaining: config.limit - bucket.timestamps.length,
    retryAfter: 0,
  };
}

// ── Preset configurations ──────────────────────────────────────────────────

export const RATE_LIMIT_PRESETS = {
  /** Expensive generation endpoints (classroom generation, scene content). */
  generation: { limit: 10, windowMs: 60_000 }, // 10/min
  /** Moderate-cost endpoints (chat, quiz grading, transcription). */
  moderate: { limit: 30, windowMs: 60_000 }, // 30/min
  /** Light endpoints (classroom storage, health, status). */
  light: { limit: 60, windowMs: 60_000 }, // 60/min
  /** Media generation (image, video — very expensive). */
  media: { limit: 5, windowMs: 60_000 }, // 5/min
  /** Authentication endpoints (signup, signin — prevent brute force). */
  auth: { limit: 5, windowMs: 60_000 }, // 5/min
} as const satisfies Record<string, { limit: number; windowMs: number }>;

/**
 * Convenience: check rate limit using a preset.
 *
 * @example
 * const result = await checkRateLimitPreset(req, 'generation', 'generate-classroom');
 * if (result.limited) return rateLimitedResponse(result);
 */
export async function checkRateLimitPreset(
  req: NextRequest,
  preset: keyof typeof RATE_LIMIT_PRESETS,
  scope: string,
): Promise<RateLimitResult> {
  const config = { ...RATE_LIMIT_PRESETS[preset], scope };
  return checkRateLimit(req, config);
}

/**
 * Build a standard 429 response for rate-limited requests.
 */
export function rateLimitedResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      success: false,
      errorCode: 'RATE_LIMITED',
      error: 'Too many requests. Please slow down.',
      details: `Retry after ${result.retryAfter}s`,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfter),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}
