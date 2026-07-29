import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

function createMockRequest(
  cookies: Record<string, string> = {},
  headers: Record<string, string> = {},
): NextRequest {
  return {
    cookies: {
      get: (name: string) =>
        name in cookies ? { value: cookies[name] } : undefined,
    },
    headers: new Headers(headers),
  } as unknown as NextRequest;
}

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', async () => {
      const { checkRateLimit } = await import('@/lib/server/rate-limit');
      const req = createMockRequest({}, { 'x-forwarded-for': '1.2.3.4' });

      const result = await checkRateLimit(req, {
        scope: 'test',
        limit: 5,
        windowMs: 60_000,
      });

      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(4);
    });

    it('should block requests exceeding limit', async () => {
      const { checkRateLimit } = await import('@/lib/server/rate-limit');
      const req = createMockRequest({}, { 'x-forwarded-for': '1.2.3.4' });

      // 消耗 5 次配额
      for (let i = 0; i < 5; i++) {
        await checkRateLimit(req, { scope: 'test-block', limit: 5, windowMs: 60_000 });
      }

      // 第 6 次应该被限流
      const result = await checkRateLimit(req, { scope: 'test-block', limit: 5, windowMs: 60_000 });
      expect(result.limited).toBe(true);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should use different buckets for different scopes', async () => {
      const { checkRateLimit } = await import('@/lib/server/rate-limit');
      const req = createMockRequest({}, { 'x-forwarded-for': '1.2.3.4' });

      // 耗尽 scope-A 的配额
      await checkRateLimit(req, { scope: 'A', limit: 1, windowMs: 60_000 });

      // scope-B 应该仍然可用
      const result = await checkRateLimit(req, { scope: 'B', limit: 1, windowMs: 60_000 });
      expect(result.limited).toBe(false);
    });

    it('should use different buckets for different IPs', async () => {
      const { checkRateLimit } = await import('@/lib/server/rate-limit');
      const req1 = createMockRequest({}, { 'x-forwarded-for': '1.1.1.1' });
      const req2 = createMockRequest({}, { 'x-forwarded-for': '2.2.2.2' });

      // 耗尽 IP1 的配额
      await checkRateLimit(req1, { scope: 'test-ip', limit: 1, windowMs: 60_000 });

      // IP2 应该仍然可用
      const result = await checkRateLimit(req2, { scope: 'test-ip', limit: 1, windowMs: 60_000 });
      expect(result.limited).toBe(false);
    });

    it('should reset after window expires', async () => {
      const { checkRateLimit } = await import('@/lib/server/rate-limit');
      const req = createMockRequest({}, { 'x-forwarded-for': '1.2.3.4' });

      // 耗尽配额
      await checkRateLimit(req, { scope: 'test-reset', limit: 1, windowMs: 60_000 });

      // 窗口内应该被限流
      const blocked = await checkRateLimit(req, { scope: 'test-reset', limit: 1, windowMs: 60_000 });
      expect(blocked.limited).toBe(true);

      // 推进时间超过窗口
      vi.advanceTimersByTime(61_000);

      // 应该重新可用
      const result = await checkRateLimit(req, { scope: 'test-reset', limit: 1, windowMs: 60_000 });
      expect(result.limited).toBe(false);
    });

    it('should use session cookie for identification when available', async () => {
      const { checkRateLimit } = await import('@/lib/server/rate-limit');
      const reqWithSession = createMockRequest(
        { 'next-auth.session-token': 'session-abc' },
        {},
      );
      const reqWithIp = createMockRequest({}, { 'x-forwarded-for': '1.2.3.4' });

      // 耗尽 session 用户配额
      await checkRateLimit(reqWithSession, { scope: 'test-session', limit: 1, windowMs: 60_000 });

      // IP 用户应该不受影响
      const result = await checkRateLimit(reqWithIp, { scope: 'test-session', limit: 1, windowMs: 60_000 });
      expect(result.limited).toBe(false);
    });
  });

  describe('checkRateLimitPreset', () => {
    it('should use preset configurations', async () => {
      const { checkRateLimitPreset, RATE_LIMIT_PRESETS } = await import('@/lib/server/rate-limit');
      const req = createMockRequest({}, { 'x-forwarded-for': '1.2.3.4' });

      const result = await checkRateLimitPreset(req, 'generation', 'test-preset');

      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(RATE_LIMIT_PRESETS.generation.limit - 1);
    });
  });

  describe('rateLimitedResponse', () => {
    it('should build a 429 response with correct headers', async () => {
      const { rateLimitedResponse } = await import('@/lib/server/rate-limit');

      const response = rateLimitedResponse({
        limited: true,
        remaining: 0,
        retryAfter: 42,
      });

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('42');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.errorCode).toBe('RATE_LIMITED');
    });
  });

  describe('sweepStale', () => {
    it('should clean up old entries after sweep interval', async () => {
      const { checkRateLimit } = await import('@/lib/server/rate-limit');
      const req = createMockRequest({}, { 'x-forwarded-for': '1.2.3.4' });

      // 创建一个 bucket
      await checkRateLimit(req, { scope: 'sweep-test', limit: 10, windowMs: 60_000 });

      // 推进时间超过 MAX_BUCKET_AGE_MS (120s) + SWEEP_INTERVAL_MS (60s)
      vi.advanceTimersByTime(180_000);

      // 新请求应该触发 sweeper 并创建新 bucket
      const result = await checkRateLimit(req, { scope: 'sweep-test', limit: 10, windowMs: 60_000 });
      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(9); // 新 bucket，9 remaining
    });
  });

  describe('edge cases', () => {
    it('should handle request without cookies or headers', async () => {
      const { checkRateLimit } = await import('@/lib/server/rate-limit');
      const req = {
        cookies: undefined,
        headers: undefined,
      } as unknown as NextRequest;

      const result = await checkRateLimit(req, { scope: 'edge', limit: 5, windowMs: 60_000 });
      expect(result.limited).toBe(false);
    });

    it('should handle access code cookie', async () => {
      const { checkRateLimit } = await import('@/lib/server/rate-limit');
      const req = createMockRequest({ nova_access: 'access-xyz' }, {});

      const result = await checkRateLimit(req, { scope: 'access-test', limit: 5, windowMs: 60_000 });
      expect(result.limited).toBe(false);
    });
  });
});
