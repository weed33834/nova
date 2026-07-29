/**
 * Cache layer tests — verifies in-memory backend behavior.
 * Redis backend is tested separately via integration tests.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { cache } from '@/lib/server/cache';

beforeEach(() => {
  cache._reset();
});

describe('Cache (in-memory)', () => {
  describe('get / set', () => {
    it('stores and retrieves a string value', async () => {
      await cache.set('key1', 'hello');
      const value = await cache.get<string>('key1');
      expect(value).toBe('hello');
    });

    it('stores and retrieves an object', async () => {
      await cache.set('key2', { name: 'test', count: 42 });
      const value = await cache.get<{ name: string; count: number }>('key2');
      expect(value).toEqual({ name: 'test', count: 42 });
    });

    it('returns null for missing keys', async () => {
      const value = await cache.get<string>('nonexistent');
      expect(value).toBeNull();
    });

    it('respects TTL expiration', async () => {
      await cache.set('short-lived', 'temp', { ttl: 1 });
      const before = await cache.get<string>('short-lived');
      expect(before).toBe('temp');

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const after = await cache.get<string>('short-lived');
      expect(after).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes a key', async () => {
      await cache.set('del-key', 'value');
      await cache.delete('del-key');
      const value = await cache.get<string>('del-key');
      expect(value).toBeNull();
    });

    it('does not throw for missing keys', async () => {
      await expect(cache.delete('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('deletePattern', () => {
    it('deletes keys matching a glob pattern', async () => {
      await cache.set('user:1', 'alice');
      await cache.set('user:2', 'bob');
      await cache.set('session:1', 'xyz');

      const count = await cache.deletePattern('user:*');
      expect(count).toBe(2);

      expect(await cache.get('user:1')).toBeNull();
      expect(await cache.get('user:2')).toBeNull();
      expect(await cache.get('session:1')).toBe('xyz');
    });
  });

  describe('exists', () => {
    it('returns true for existing keys', async () => {
      await cache.set('exists-key', 'value');
      expect(await cache.exists('exists-key')).toBe(true);
    });

    it('returns false for missing keys', async () => {
      expect(await cache.exists('nope')).toBe(false);
    });
  });

  describe('incr', () => {
    it('increments from 0 for new keys', async () => {
      const result = await cache.incr('counter', 60);
      expect(result).toBe(1);
    });

    it('increments existing values', async () => {
      await cache.incr('counter2', 60);
      await cache.incr('counter2', 60);
      const result = await cache.incr('counter2', 60);
      expect(result).toBe(3);
    });
  });

  describe('wrap', () => {
    it('calls fn on cache miss', async () => {
      let calls = 0;
      const fn = async () => {
        calls++;
        return 'computed';
      };

      const result1 = await cache.wrap('wrap-key', fn, 60);
      expect(result1).toBe('computed');
      expect(calls).toBe(1);

      // Second call should use cache
      const result2 = await cache.wrap('wrap-key', fn, 60);
      expect(result2).toBe('computed');
      expect(calls).toBe(1);
    });

    it('caches objects via wrap', async () => {
      const data = { items: [1, 2, 3] };
      const result = await cache.wrap('wrap-obj', async () => data, 60);
      expect(result).toEqual(data);
    });
  });

  describe('namespace', () => {
    it('uses namespace prefix to avoid collisions', async () => {
      await cache.set('key', 'ns1-value', { namespace: 'ns1' });
      await cache.set('key', 'ns2-value', { namespace: 'ns2' });

      expect(await cache.get('key', { namespace: 'ns1' })).toBe('ns1-value');
      expect(await cache.get('key', { namespace: 'ns2' })).toBe('ns2-value');
    });
  });
});
