import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Health Check', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildReadinessPayload', () => {
    it('should return status ok with version and timestamp', async () => {
      const { buildReadinessPayload } = await import('@/lib/server/health');

      const payload = buildReadinessPayload();

      expect(payload.status).toBe('ok');
      expect(payload.version).toBeDefined();
      expect(payload.timestamp).toBeDefined();
    });

    it('should report capabilities from provider config', async () => {
      const { buildReadinessPayload } = await import('@/lib/server/health');

      const payload = buildReadinessPayload();

      expect(payload.capabilities).toBeDefined();
      expect(typeof payload.capabilities.webSearch).toBe('boolean');
      expect(typeof payload.capabilities.imageGeneration).toBe('boolean');
      expect(typeof payload.capabilities.videoGeneration).toBe('boolean');
      expect(typeof payload.capabilities.tts).toBe('boolean');
    });

    it('should report services section with all enterprise features', async () => {
      const { buildReadinessPayload } = await import('@/lib/server/health');

      const payload = buildReadinessPayload();

      expect(payload.services).toBeDefined();
      expect(payload.services).toHaveProperty('storage');
      expect(payload.services).toHaveProperty('email');
      expect(payload.services).toHaveProperty('distributedRateLimit');
      expect(payload.services).toHaveProperty('quota');
      expect(payload.services).toHaveProperty('webhookSigning');
      expect(payload.services).toHaveProperty('sentry');
      expect(payload.services).toHaveProperty('accessCode');
    });

    it('should report noop storage when S3 is not configured', async () => {
      delete process.env.S3_BUCKET;
      const { buildReadinessPayload } = await import('@/lib/server/health');

      const payload = buildReadinessPayload();

      expect(payload.services.storage).toBe('noop');
    });

    it('should report s3 storage when S3_BUCKET is configured', async () => {
      process.env.S3_BUCKET = 'test-bucket';
      const { buildReadinessPayload } = await import('@/lib/server/health');

      const payload = buildReadinessPayload();

      expect(payload.services.storage).toBe('s3');

      delete process.env.S3_BUCKET;
    });

    it('should report email as false when SMTP is not configured', async () => {
      delete process.env.SMTP_HOST;
      const { buildReadinessPayload } = await import('@/lib/server/health');

      const payload = buildReadinessPayload();

      expect(payload.services.email).toBe(false);
    });

    it('should report email as true when SMTP_HOST is configured', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      const { buildReadinessPayload } = await import('@/lib/server/health');

      const payload = buildReadinessPayload();

      expect(payload.services.email).toBe(true);

      delete process.env.SMTP_HOST;
    });

    it('should report distributedRateLimit based on Upstash Redis config', async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      const { buildReadinessPayload } = await import('@/lib/server/health');

      const payload = buildReadinessPayload();
      expect(payload.services.distributedRateLimit).toBe(false);

      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      const payload2 = buildReadinessPayload();
      expect(payload2.services.distributedRateLimit).toBe(true);

      delete process.env.UPSTASH_REDIS_REST_URL;
    });

    it('should report quota as true when any QUOTA_ env var is set', async () => {
      delete process.env.QUOTA_LLM_CALLS;
      delete process.env.QUOTA_IMAGE_GEN;
      delete process.env.QUOTA_VIDEO_GEN;
      delete process.env.QUOTA_TTS_CHARS;

      const { buildReadinessPayload } = await import('@/lib/server/health');

      const payload = buildReadinessPayload();
      expect(payload.services.quota).toBe(false);

      process.env.QUOTA_LLM_CALLS = '1000';
      const payload2 = buildReadinessPayload();
      expect(payload2.services.quota).toBe(true);

      delete process.env.QUOTA_LLM_CALLS;
    });

    it('should report sentry based on SENTRY_DSN', async () => {
      delete process.env.SENTRY_DSN;
      const { buildReadinessPayload } = await import('@/lib/server/health');

      const payload = buildReadinessPayload();
      expect(payload.services.sentry).toBe(false);

      process.env.SENTRY_DSN = 'https://example@sentry.io/123';
      const payload2 = buildReadinessPayload();
      expect(payload2.services.sentry).toBe(true);

      delete process.env.SENTRY_DSN;
    });

    it('should report accessCode based on ACCESS_CODE', async () => {
      delete process.env.ACCESS_CODE;
      const { buildReadinessPayload } = await import('@/lib/server/health');

      const payload = buildReadinessPayload();
      expect(payload.services.accessCode).toBe(false);

      process.env.ACCESS_CODE = 'secret-code';
      const payload2 = buildReadinessPayload();
      expect(payload2.services.accessCode).toBe(true);

      delete process.env.ACCESS_CODE;
    });
  });
});
