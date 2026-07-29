/**
 * General-purpose cache layer — Upstash Redis with in-memory fallback.
 *
 * Beyond rate limiting, this module provides a unified caching interface
 * for session data, expensive computations, provider configs, and more.
 *
 * When `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set,
 * all operations use Upstash Redis (distributed, shared across instances).
 * Otherwise, falls back to an in-memory LRU cache (single-instance only).
 *
 * Usage:
 * ```ts
 * import { cache } from '@/lib/server/cache';
 *
 * // Simple get/set
 * const value = await cache.get<string>('my-key');
 * await cache.set('my-key', 'hello', 60); // TTL: 60s
 *
 * // Or use the wrap pattern (fetch from source on miss)
 * const data = await cache.wrap('expensive-key', async () => {
 *   return await fetchDataFromDB();
 * }, 300); // TTL: 5 min
 * ```
 */
import { createLogger } from '@/lib/logger';

const log = createLogger('Cache');

// ── Types ──────────────────────────────────────────────────────────────────

export interface CacheOptions {
  /** TTL in seconds. 0 = no expiration (use with caution). */
  ttl?: number;
  /** Namespace prefix to avoid key collisions. */
  namespace?: string;
}

interface CacheBackend {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl: number): Promise<void>;
  delete(key: string): Promise<void>;
  deletePattern(pattern: string): Promise<number>;
  exists(key: string): Promise<boolean>;
  incr(key: string, ttl: number): Promise<number>;
}

// ── In-memory LRU cache ────────────────────────────────────────────────────

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const MAX_ENTRIES = 1000;
const memStore = new Map<string, CacheEntry>();

function memSweep(): void {
  const now = Date.now();
  for (const [key, entry] of memStore) {
    if (entry.expiresAt <= now) {
      memStore.delete(key);
    }
  }
}

class MemoryCacheBackend implements CacheBackend {
  async get<T>(key: string): Promise<T | null> {
    const entry = memStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      memStore.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    // Evict oldest entries if at capacity
    if (memStore.size >= MAX_ENTRIES) {
      const firstKey = memStore.keys().next().value;
      if (firstKey) memStore.delete(firstKey);
    }
    memStore.set(key, {
      value,
      expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : Number.MAX_SAFE_INTEGER,
    });
  }

  async delete(key: string): Promise<void> {
    memStore.delete(key);
  }

  async deletePattern(pattern: string): Promise<number> {
    const regex = globToRegex(pattern);
    let count = 0;
    for (const key of memStore.keys()) {
      if (regex.test(key)) {
        memStore.delete(key);
        count++;
      }
    }
    return count;
  }

  async exists(key: string): Promise<boolean> {
    const entry = memStore.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= Date.now()) {
      memStore.delete(key);
      return false;
    }
    return true;
  }

  async incr(key: string, ttl: number): Promise<number> {
    const entry = memStore.get(key);
    const current = entry ? (entry.value as number) : 0;
    const newValue = current + 1;
    await this.set(key, newValue, ttl);
    return newValue;
  }
}

// ── Upstash Redis backend ──────────────────────────────────────────────────

class RedisCacheBackend implements CacheBackend {
  private redis: NonNullable<Awaited<ReturnType<typeof initRedis>>>;

  constructor(redis: NonNullable<Awaited<ReturnType<typeof initRedis>>>) {
    this.redis = redis;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (raw === null || raw === undefined) return null;
    try {
      return typeof raw === 'string' ? (JSON.parse(raw) as T) : (raw as T);
    } catch {
      return raw as T;
    }
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttl > 0) {
      await this.redis.set(key, serialized, { ex: ttl });
    } else {
      await this.redis.set(key, serialized);
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async deletePattern(pattern: string): Promise<number> {
    // Upstash Redis supports SCAN + DELETE via pipeline
    const keys = await this.redis.keys(pattern);
    if (keys.length === 0) return 0;
    await this.redis.del(...keys);
    return keys.length;
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result > 0;
  }

  async incr(key: string, ttl: number): Promise<number> {
    const pipeline = this.redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, ttl);
    const results = await pipeline.exec();
    return (results[0] as number) ?? 0;
  }
}

// ── Redis initialization ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RedisClient = any;

async function initRedis(): Promise<RedisClient | null> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return null;

  try {
    const { Redis } = await import('@upstash/redis');
    return new Redis({ url: redisUrl, token: redisToken });
  } catch {
    log.warn('UPSTASH_REDIS_REST_URL set but @upstash/redis not installed; using in-memory cache');
    return null;
  }
}

let _backend: CacheBackend | null = null;
let _initialized = false;

async function getBackend(): Promise<CacheBackend> {
  if (!_initialized) {
    _initialized = true;
    const redis = await initRedis();
    if (redis) {
      _backend = new RedisCacheBackend(redis);
      log.info('Redis cache backend enabled (Upstash)');
    } else {
      _backend = new MemoryCacheBackend();
      log.info('Using in-memory cache backend');
    }
    // Schedule periodic sweeps for in-memory mode
    if (!redis) {
      setInterval(memSweep, 60_000).unref?.();
    }
  }
  return _backend!;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function buildKey(key: string, namespace?: string): string {
  return namespace ? `${namespace}:${key}` : `nova:${key}`;
}

// ── Public API ─────────────────────────────────────────────────────────────

export const cache = {
  /**
   * Get a value from the cache.
   * Returns null if the key doesn't exist or has expired.
   */
  async get<T>(key: string, opts?: CacheOptions): Promise<T | null> {
    const backend = await getBackend();
    return backend.get<T>(buildKey(key, opts?.namespace));
  },

  /**
   * Set a value in the cache with an optional TTL.
   * @param ttl Time-to-live in seconds (default: 300 = 5 min)
   */
  async set<T>(key: string, value: T, opts?: CacheOptions): Promise<void> {
    const backend = await getBackend();
    await backend.set(buildKey(key, opts?.namespace), value, opts?.ttl ?? 300);
  },

  /**
   * Delete a single key from the cache.
   */
  async delete(key: string, opts?: CacheOptions): Promise<void> {
    const backend = await getBackend();
    await backend.delete(buildKey(key, opts?.namespace));
  },

  /**
   * Delete all keys matching a glob pattern (e.g. "user:*").
   * @returns Number of keys deleted.
   */
  async deletePattern(pattern: string, opts?: CacheOptions): Promise<number> {
    const backend = await getBackend();
    const fullPattern = buildKey(pattern, opts?.namespace).replace(/:/g, ':');
    return backend.deletePattern(fullPattern);
  },

  /**
   * Check if a key exists in the cache.
   */
  async exists(key: string, opts?: CacheOptions): Promise<boolean> {
    const backend = await getBackend();
    return backend.exists(buildKey(key, opts?.namespace));
  },

  /**
   * Atomic increment with TTL. Useful for counters.
   * The key is created if it doesn't exist, with the given TTL.
   */
  async incr(key: string, ttl: number, opts?: CacheOptions): Promise<number> {
    const backend = await getBackend();
    return backend.incr(buildKey(key, opts?.namespace), ttl);
  },

  /**
   * Wrap a function with caching — fetches from cache on hit,
   * calls the function on miss and stores the result.
   *
   * @param key Cache key
   * @param fn Function to call on cache miss
   * @param ttl TTL in seconds (default: 300 = 5 min)
   */
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number = 300,
    opts?: CacheOptions,
  ): Promise<T> {
    const cached = await cache.get<T>(key, opts);
    if (cached !== null) return cached;

    const value = await fn();
    await cache.set(key, value, { ...opts, ttl });
    return value;
  },

  /**
   * Whether the cache is using Redis (distributed) or in-memory.
   */
  isDistributed(): boolean {
    return _backend instanceof RedisCacheBackend;
  },

  /**
   * Reset the cache backend (for testing).
   */
  _reset(): void {
    _backend = null;
    _initialized = false;
    memStore.clear();
  },
};
