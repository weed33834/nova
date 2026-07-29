import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';

describe('API Key Authentication', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateApiKey', () => {
    it('should generate a key with the correct prefix', async () => {
      const { generateApiKey } = await import('@/lib/server/api-key-auth');
      const { plaintext } = generateApiKey();

      expect(plaintext.startsWith('nva_')).toBe(true);
    });

    it('should generate a 64-char hex secret after the prefix', async () => {
      const { generateApiKey } = await import('@/lib/server/api-key-auth');
      const { plaintext } = generateApiKey();

      const secret = plaintext.slice(4); // remove 'nva_'
      expect(secret).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce a consistent SHA-256 hash', async () => {
      const { generateApiKey } = await import('@/lib/server/api-key-auth');
      const { plaintext, hash } = generateApiKey();

      const expected = createHash('sha256').update(plaintext).digest('hex');
      expect(hash).toBe(expected);
    });

    it('should produce a 12-char prefix for display', async () => {
      const { generateApiKey } = await import('@/lib/server/api-key-auth');
      const { plaintext, prefix } = generateApiKey();

      expect(prefix).toBe(plaintext.slice(0, 12));
      expect(prefix.startsWith('nva_')).toBe(true);
    });

    it('should generate unique keys on each call', async () => {
      const { generateApiKey } = await import('@/lib/server/api-key-auth');
      const key1 = generateApiKey();
      const key2 = generateApiKey();

      expect(key1.plaintext).not.toBe(key2.plaintext);
      expect(key1.hash).not.toBe(key2.hash);
    });
  });

  describe('hashKey', () => {
    it('should produce a deterministic SHA-256 hex digest', async () => {
      const { hashKey } = await import('@/lib/server/api-key-auth');

      const result = hashKey('nva_testkey123');
      const expected = createHash('sha256').update('nva_testkey123').digest('hex');
      expect(result).toBe(expected);
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('hasScope', () => {
    it('should grant all permissions when scopes is empty or undefined', async () => {
      const { hasScope } = await import('@/lib/server/api-key-auth');

      expect(hasScope([], 'classroom:create')).toBe(true);
      expect(hasScope(undefined, 'classroom:create')).toBe(true);
    });

    it('should grant access when the required scope is present', async () => {
      const { hasScope } = await import('@/lib/server/api-key-auth');

      expect(hasScope(['classroom:create', 'classroom:read'], 'classroom:create')).toBe(true);
    });

    it('should deny access when the required scope is missing', async () => {
      const { hasScope } = await import('@/lib/server/api-key-auth');

      expect(hasScope(['classroom:read'], 'classroom:create')).toBe(false);
    });

    it('should grant all access when wildcard scope is present', async () => {
      const { hasScope } = await import('@/lib/server/api-key-auth');

      expect(hasScope(['*'], 'classroom:create')).toBe(true);
      expect(hasScope(['*'], 'admin:delete')).toBe(true);
    });
  });

  describe('authenticateWithApiKey', () => {
    it('should reject missing Authorization header', async () => {
      const { authenticateWithApiKey } = await import('@/lib/server/api-key-auth');

      const result = await authenticateWithApiKey(null);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('missing');
    });

    it('should reject non-Bearer tokens', async () => {
      const { authenticateWithApiKey } = await import('@/lib/server/api-key-auth');

      const result = await authenticateWithApiKey('Basic abc123');
      expect(result.valid).toBe(false);
    });

    it('should reject keys without the nva_ prefix', async () => {
      const { authenticateWithApiKey } = await import('@/lib/server/api-key-auth');

      const result = await authenticateWithApiKey('Bearer invalid_key_format');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('format');
    });
  });
});
