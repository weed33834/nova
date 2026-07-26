const MAX_CACHE_ENTRIES = 500;

const store = new Map<string, { data: unknown; expiresAt: number }>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function cacheSet<T>(key: string, data: T, ttlMs = 60_000): void {
  // Cap the cache to prevent unbounded growth — expired entries are only
  // removed lazily on read, so without a cap a long-lived process with many
  // unique keys accumulates memory indefinitely. Map preserves insertion
  // order, so evict the oldest entry when a NEW key would exceed the cap.
  if (!store.has(key) && store.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) store.delete(oldestKey);
  }
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function cacheDelete(key: string): void {
  store.delete(key);
}

export function cacheClear(): void {
  store.clear();
}

export async function cacheFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 60_000,
): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== undefined) return cached;
  const data = await fetcher();
  cacheSet(key, data, ttlMs);
  return data;
}
