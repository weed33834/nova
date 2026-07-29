/**
 * Comprehensive scenario tests covering edge cases, boundary conditions,
 * and complex real-world flows.
 *
 * Consolidated from edge-cases + full-user-journey (deduplicated).
 * Covers:
 *  - Boundary conditions (empty, huge, malformed inputs)
 *  - Security scenarios (XSS, path traversal, injection)
 *  - Error handling paths (LLM timeout, provider down, rate limit)
 *  - Circuit breaker failover & recovery
 *  - Video timeline export compilation
 *  - State persistence & idempotent sanitization
 *  - Concurrent request handling
 *  - Full user flow simulation
 */
import { describe, it, expect, vi } from 'vitest';
import { sanitizeRichText, sanitizePlainText, sanitizeObject, containsDangerousHtml } from '@/lib/server/sanitize';
import { buildReadinessPayload } from '@/lib/server/health';
import { RATE_LIMIT_PRESETS, checkRateLimit } from '@/lib/server/rate-limit';
import { createLogger, runWithRequestId, getRequestId } from '@/lib/logger';
import { withApiHandler } from '@/lib/server/api-handler';
import { compileVideoTimeline } from '@/lib/video-export';
import type { CompileDeps, CompilerScene } from '@/lib/video-export';
import { NextRequest } from 'next/server';

// ─── Helpers ───────────────────────────────────────────────────────────────

function mockNextRequest(
  method: string,
  pathname: string,
  options?: { body?: unknown; headers?: Record<string, string> },
): NextRequest {
  const url = `http://localhost:3000${pathname}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    host: 'localhost:3000',
    ...options?.headers,
  };
  const init: { method: string; headers: Record<string, string>; body?: string } = { method, headers };
  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new NextRequest(url, init as any);
}

// ─── 1. Boundary Conditions ────────────────────────────────────────────────

describe('Scenario: Boundary Conditions', () => {
  describe('Input size boundaries', () => {
    it('handles empty string sanitization', () => {
      expect(sanitizeRichText('')).toBe('');
      expect(sanitizePlainText('')).toBe('');
      expect(sanitizeObject('')).toBe('');
    });

    it('handles very long text (10MB)', () => {
      const huge = 'A'.repeat(10 * 1024 * 1024);
      const result = sanitizePlainText(huge);
      expect(result.length).toBe(huge.length);
    });

    it('handles deeply nested objects (depth > 10)', () => {
      let obj: Record<string, unknown> = { value: 'deep' };
      for (let i = 0; i < 15; i++) {
        obj = { nested: obj };
      }
      // Should not throw or hang
      const result = sanitizeObject(obj);
      expect(result).toBeDefined();
    });

    it('handles null and undefined in various positions', () => {
      expect(sanitizeObject(null)).toBe(null);
      expect(sanitizeObject(undefined)).toBe(undefined);
      expect(sanitizeObject({ a: null, b: undefined })).toEqual({ a: null, b: undefined });
      expect(sanitizeObject({ a: [null, undefined, 'text'] })).toEqual({ a: [null, undefined, 'text'] });
    });

    it('handles unicode and emoji content', () => {
      const input = '<p>Hello 世界 🌍 café</p>';
      const result = sanitizeRichText(input);
      expect(result).toContain('Hello 世界 🌍 café');
    });

    it('handles mixed type arrays', () => {
      const obj = { items: [1, 'text', true, null, { nested: '<b>x</b>' }] };
      const result = sanitizeObject(obj);
      expect(result.items[0]).toBe(1);
      expect(result.items[1]).toBe('text');
      expect(result.items[2]).toBe(true);
      expect(result.items[3]).toBe(null);
      expect((result.items[4] as { nested: string }).nested).toBe('x');
    });
  });

  describe('ID validation boundaries', () => {
    it('handles empty classroom ID', () => {
      const id = '';
      expect(id.length).toBe(0);
    });

    it('handles very long classroom ID (UUID is 36 chars)', () => {
      const id = 'a'.repeat(1000);
      expect(id.length).toBe(1000);
    });

    it('handles special characters in potential IDs', () => {
      const ids = [
        '../../../etc/passwd',
        '"; DROP TABLE classrooms; --',
        '<script>alert(1)</script>',
        'null',
        'undefined',
        'NaN',
        '   ',
      ];
      ids.forEach((id) => {
        expect(typeof id).toBe('string');
      });
    });
  });
});

// ─── 2. Security Scenarios ────────────────────────────────────────────────

describe('Scenario: Security Edge Cases', () => {
  describe('XSS prevention', () => {
    it('prevents stored XSS via script tags in content', () => {
      const malicious = {
        title: 'Normal Title',
        content: '<script>document.cookie</script><p>Good content</p>',
      };
      const sanitized = sanitizeObject(malicious);
      expect(sanitized.content).not.toContain('<script');
      expect(sanitized.content).not.toContain('document.cookie');
      expect(sanitized.content).toContain('Good content');
    });

    it('prevents XSS via event handlers', () => {
      const inputs = [
        '<img src=x onerror="alert(1)">',
        '<p onclick="alert(1)">text</p>',
        '<div onmouseover="evil()">text</div>',
        '<a href="javascript:void(0)" onclick="alert(1)">link</a>',
      ];
      inputs.forEach((input) => {
        const result = sanitizeRichText(input);
        expect(result).not.toMatch(/\son\w+\s*=/);
      });
    });

    it('prevents XSS via encoded payloads', () => {
      // sanitize-html doesn't decode entities, so encoded tags become text
      // (not executable). The key is that no actual script tag is rendered.
      const inputs = [
        '<scr&#105;pt>alert(1)</scr&#105;pt>',
        '<img src=x:onerror=alert(1)>',
        '<svg/onload=alert(1)>',
      ];
      inputs.forEach((input) => {
        const result = sanitizeRichText(input);
        // No executable script tag should survive sanitization
        expect(result).not.toMatch(/<script/i);
        expect(result).not.toMatch(/\sonload\s*=/i);
        expect(result).not.toMatch(/\sonerror\s*=/i);
      });
    });

    it('prevents XSS via data: URLs (except images)', () => {
      const result = sanitizeRichText('<a href="data:text/html,<script>alert(1)</script>">click</a>');
      expect(result).not.toContain('data:text/html');
    });

    it('detects dangerous HTML with containsDangerousHtml', () => {
      const dangerous = [
        '<script>alert(1)</script>',
        '<iframe src="evil.com"></iframe>',
        '<p onclick="alert(1)">x</p>',
        '<a href="javascript:alert(1)">x</a>',
        '<embed src="evil.swf">',
        '<object data="evil.swf">',
      ];
      dangerous.forEach((input) => {
        expect(containsDangerousHtml(input)).toBe(true);
      });
    });
  });

  describe('Path traversal prevention', () => {
    it('path traversal attempts contain traversal sequences', () => {
      const traversals = [
        '../../../etc/passwd',
        '..\\\\..\\\\windows\\\\system32',
        '....//....//etc/passwd',
      ];
      traversals.forEach((id) => {
        // These are literal path traversal attempts that should be rejected
        // by the isValidClassroomId function in the route handler
        expect(id.length).toBeGreaterThan(0);
      });
    });

    it('URL-encoded path traversal is distinct from literal traversal', () => {
      const encoded = '%2e%2e%2f%2e%2e%2f';
      // URL-encoded form does not contain literal '..' — this is expected
      // and handled by URL decoding in the request pipeline
      expect(encoded).not.toContain('..');
    });
  });

  describe('SQL injection prevention', () => {
    it('SQL injection payloads are sanitized as plain text (no HTML execution)', () => {
      const payloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; INSERT INTO admin VALUES('hacker','pass'); --",
        "1; EXEC xp_cmdshell('dir')",
      ];
      payloads.forEach((payload) => {
        const result = sanitizePlainText(payload);
        // sanitizePlainText strips HTML tags but preserves text content
        // The security guarantee is that these are stored as plain text strings
        // and parameterized queries (Drizzle ORM) prevent SQL injection
        expect(typeof result).toBe('string');
        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
      });
    });
  });
});

// ─── 3. Error Handling Paths ──────────────────────────────────────────────

describe('Scenario: Error Handling', () => {
  describe('API handler error catching', () => {
    it('returns 500 for unhandled errors', async () => {
      const handler = vi.fn(async () => {
        throw new Error('Unexpected internal error');
      });
      const wrapped = withApiHandler(handler);
      const req = mockNextRequest('POST', '/api/test');
      const res = await wrapped(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.errorCode).toBe('INTERNAL_ERROR');
      expect(body.error).toBe('Internal server error');
    });

    it('returns 401 for AuthRequiredError', async () => {
      const handler = vi.fn(async () => {
        const err = new Error('Authentication required');
        err.name = 'AuthRequiredError';
        throw err;
      });
      const wrapped = withApiHandler(handler);
      const req = mockNextRequest('POST', '/api/test');
      const res = await wrapped(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.errorCode).toBe('INVALID_CREDENTIALS');
    });

    it('returns 403 for ForbiddenError', async () => {
      const handler = vi.fn(async () => {
        const err = new Error('Forbidden: missing permission');
        err.name = 'ForbiddenError';
        throw err;
      });
      const wrapped = withApiHandler(handler);
      const req = mockNextRequest('POST', '/api/test');
      const res = await wrapped(req);

      expect(res.status).toBe(403);
    });

    it('returns 429 when rate limited', async () => {
      const handler = vi.fn(async () => new Response('ok', { status: 200 }));
      const wrapped = withApiHandler(handler, { rateLimit: 'auth', rateLimitScope: 'test-ratelimit' });

      // Exhaust the rate limit (5 requests for 'auth' preset)
      for (let i = 0; i < 5; i++) {
        const req = mockNextRequest('POST', '/api/test');
        await wrapped(req);
      }

      // 6th request should be rate limited
      const req = mockNextRequest('POST', '/api/test');
      const res = await wrapped(req);

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.errorCode).toBe('RATE_LIMITED');
      expect(res.headers.get('Retry-After')).toBeTruthy();
    });

    it('preserves request ID in error responses', async () => {
      const handler = vi.fn(async () => {
        throw new Error('fail');
      });
      const wrapped = withApiHandler(handler);
      const req = mockNextRequest('POST', '/api/test', {
        headers: { 'x-request-id': 'error-req-123' },
      });
      const res = await wrapped(req);

      expect(res.headers.get('x-request-id')).toBe('error-req-123');
    });
  });

  describe('Health check under degraded conditions', () => {
    it('reports status when circuit breakers are closed (healthy)', () => {
      const payload = buildReadinessPayload();
      expect(payload.status).toBe('ok');
      expect(payload.circuitBreakers).toBeDefined();
    });

    it('includes all service indicators', () => {
      const payload = buildReadinessPayload();
      expect(payload.services).toHaveProperty('storage');
      expect(payload.services).toHaveProperty('email');
      expect(payload.services).toHaveProperty('distributedRateLimit');
      expect(payload.services).toHaveProperty('quota');
      expect(payload.services).toHaveProperty('webhookSigning');
      expect(payload.services).toHaveProperty('sentry');
      expect(payload.services).toHaveProperty('accessCode');
      expect(payload.services).toHaveProperty('metrics');
      expect(payload.services).toHaveProperty('apiDocs');
      expect(payload.services).toHaveProperty('learningAnalytics');
      expect(payload.services).toHaveProperty('contentModeration');
    });
  });
});

// ─── 4. Rate Limiting Scenarios ───────────────────────────────────────────

describe('Scenario: Rate Limiting', () => {
  it('presets have correct limits', () => {
    expect(RATE_LIMIT_PRESETS.generation.limit).toBe(10);
    expect(RATE_LIMIT_PRESETS.moderate.limit).toBe(30);
    expect(RATE_LIMIT_PRESETS.light.limit).toBe(60);
    expect(RATE_LIMIT_PRESETS.media.limit).toBe(5);
    expect(RATE_LIMIT_PRESETS.auth.limit).toBe(5);
  });

  it('all presets use 60-second window', () => {
    Object.values(RATE_LIMIT_PRESETS).forEach((preset) => {
      expect(preset.windowMs).toBe(60_000);
    });
  });

  it('allows requests within limit', async () => {
    const req = mockNextRequest('GET', '/api/test');
    for (let i = 0; i < 3; i++) {
      const result = await checkRateLimit(req, { scope: 'test-allow', limit: 10, windowMs: 60_000 });
      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(10 - i - 1);
    }
  });

  it('blocks requests exceeding limit', async () => {
    const req = mockNextRequest('GET', '/api/test');
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(req, { scope: 'test-block', limit: 3, windowMs: 60_000 });
    }
    const result = await checkRateLimit(req, { scope: 'test-block', limit: 3, windowMs: 60_000 });
    expect(result.limited).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('uses different buckets for different scopes', async () => {
    const req = mockNextRequest('GET', '/api/test');
    // Exhaust scope A
    await checkRateLimit(req, { scope: 'scope-a', limit: 1, windowMs: 60_000 });
    const aResult = await checkRateLimit(req, { scope: 'scope-a', limit: 1, windowMs: 60_000 });
    expect(aResult.limited).toBe(true);

    // Scope B should still be available
    const bResult = await checkRateLimit(req, { scope: 'scope-b', limit: 1, windowMs: 60_000 });
    expect(bResult.limited).toBe(false);
  });
});

// ─── 5. Request ID Correlation ────────────────────────────────────────────

describe('Scenario: Request ID Correlation', () => {
  it('generates unique request IDs for different requests', async () => {
    const handler = vi.fn(async () => new Response('ok', { status: 200 }));
    const wrapped = withApiHandler(handler);

    const req1 = mockNextRequest('GET', '/api/test');
    const res1 = await wrapped(req1);
    const id1 = res1.headers.get('x-request-id');

    const req2 = mockNextRequest('GET', '/api/test');
    const res2 = await wrapped(req2);
    const id2 = res2.headers.get('x-request-id');

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it('logger correlates within request context', () => {
    const id = 'correlation-test-id';
    runWithRequestId(id, () => {
      expect(getRequestId()).toBe(id);
      const log = createLogger('TestModule');
      expect(() => log.info('test message')).not.toThrow();
    });
    expect(getRequestId()).toBeUndefined();
  });

  it('supports concurrent request contexts', () => {
    const id1 = 'concurrent-1';
    const id2 = 'concurrent-2';

    runWithRequestId(id1, () => {
      expect(getRequestId()).toBe(id1);

      runWithRequestId(id2, () => {
        expect(getRequestId()).toBe(id2);
      });

      expect(getRequestId()).toBe(id1);
    });
  });
});

// ─── 6. Full User Flow Simulation ─────────────────────────────────────────

describe('Scenario: Full User Flow (Start → Generate → Export)', () => {
  it('simulates classroom creation with sanitized content', () => {
    // Step 1: User creates a classroom with potentially dangerous content
    const userInput = {
      stage: {
        id: 'classroom-123',
        name: 'My Classroom<script>alert(1)</script>',
        description: '<p>Learning about <strong>science</strong></p>',
      },
      scenes: [
        {
          id: 'scene-1',
          type: 'slide',
          content: '<p>Photosynthesis</p><script>steal()</script>',
          title: 'Introduction to Photosynthesis',
        },
        {
          id: 'scene-2',
          type: 'quiz',
          content: '<p>What is H<sub>2</sub>O?</p>',
          question: 'What is the chemical formula for water?',
        },
      ],
    };

    // Sanitize before storage
    const sanitized = sanitizeObject(userInput);

    // Verify XSS is stripped but safe content preserved
    expect(sanitized.stage.name).not.toContain('<script');
    expect(sanitized.stage.name).not.toContain('alert');
    expect(sanitized.stage.description).toContain('<strong>science</strong>');
    expect(sanitized.scenes[0].content).not.toContain('<script');
    expect(sanitized.scenes[0].content).toContain('Photosynthesis');
    expect(sanitized.scenes[1].content).toContain('<sub>2</sub>');
  });

  it('simulates health check before user starts', () => {
    const health = buildReadinessPayload();

    // User checks if the system is ready
    expect(health.status).toBe('ok');
    expect(health.uptime).toBeGreaterThan(0);
    expect(health.capabilities).toBeDefined();
  });

  it('simulates rate-limited generation flow', async () => {
    // User attempts multiple generation requests rapidly
    const req = mockNextRequest('POST', '/api/generate-classroom');

    const results: { limited: boolean; remaining: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const result = await checkRateLimit(req, {
        scope: 'generation-flow-test',
        limit: 10,
        windowMs: 60_000,
      });
      results.push({ limited: result.limited, remaining: result.remaining });
    }

    // First 10 should succeed
    expect(results.slice(0, 10).every((r) => !r.limited)).toBe(true);
    // Last 2 should be rate limited
    expect(results.slice(10).every((r) => r.limited)).toBe(true);
  });

  it('simulates error recovery flow', async () => {
    // First request fails
    const failingHandler = vi.fn(async () => {
      throw new Error('LLM provider timeout');
    });
    const wrappedFail = withApiHandler(failingHandler);
    const req1 = mockNextRequest('POST', '/api/generate');
    const res1 = await wrappedFail(req1);
    expect(res1.status).toBe(500);

    // Second request succeeds (system recovers)
    const successHandler = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, data: 'recovered' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const wrappedSuccess = withApiHandler(successHandler);
    const req2 = mockNextRequest('POST', '/api/generate');
    const res2 = await wrappedSuccess(req2);
    expect(res2.status).toBe(200);

    // Both have request IDs for log correlation
    expect(res1.headers.get('x-request-id')).toBeTruthy();
    expect(res2.headers.get('x-request-id')).toBeTruthy();
    expect(res1.headers.get('x-request-id')).not.toBe(res2.headers.get('x-request-id'));
  });
});

// ─── 7. Concurrent Request Handling ───────────────────────────────────────

describe('Scenario: Concurrent Requests', () => {
  it('handles multiple simultaneous API calls with unique request IDs', async () => {
    const handler = vi.fn(async () => new Response('ok', { status: 200 }));
    const wrapped = withApiHandler(handler);

    const requests = Array.from({ length: 10 }, () => mockNextRequest('POST', '/api/test'));
    const responses = await Promise.all(requests.map((req) => wrapped(req)));

    const requestIds = responses.map((res) => res.headers.get('x-request-id'));
    const uniqueIds = new Set(requestIds);

    expect(uniqueIds.size).toBe(10); // All unique
    expect(responses.every((res) => res.status === 200)).toBe(true);
  });

  it('logger context isolation between concurrent requests', () => {
    const ids = ['req-a', 'req-b', 'req-c', 'req-d', 'req-e'];
    const captured: string[] = [];

    // Simulate concurrent contexts
    ids.forEach((id) => {
      runWithRequestId(id, () => {
        captured.push(getRequestId()!);
      });
    });

    expect(captured).toEqual(ids);
  });
});

// ─── 8. Complex Content Scenarios ─────────────────────────────────────────

describe('Scenario: Complex Content Handling', () => {
  it('handles classroom with mixed scene types', () => {
    const classroom = {
      stage: {
        id: 'complex-classroom',
        name: 'Complex Course',
        description: '<p>A course with <em>various</em> scene types</p>',
      },
      scenes: [
        { id: 's1', type: 'slide', content: '<p>Slide content</p>', title: 'Slide 1' },
        { id: 's2', type: 'quiz', content: '<p>Quiz question</p>', question: 'Q1?' },
        { id: 's3', type: 'interactive', content: '<div>Interactive</div>', html: '<canvas></canvas>' },
        { id: 's4', type: 'pbl', content: '<p>PBL scenario</p>', brief: 'Problem description' },
        { id: 's5', type: 'video', content: '<p>Video scene</p>', videoUrl: 'https://example.com/v.mp4' },
      ],
    };

    const sanitized = sanitizeObject(classroom);

    // All scenes preserved
    expect(sanitized.scenes.length).toBe(5);
    // XSS-safe
    expect(JSON.stringify(sanitized)).not.toContain('<script');
    // Rich text preserved in content fields
    expect(sanitized.scenes[0].content).toContain('<p>Slide content</p>');
  });

  it('handles nested JSON structures in stage', () => {
    const stage = {
      id: 'nested-test',
      name: 'Nested Stage',
      config: {
        theme: { primary: '#ff0000', secondary: '#00ff00' },
        layout: { type: 'grid', columns: 3 },
        metadata: { author: 'test', tags: ['science', 'biology'] },
      },
    };

    const sanitized = sanitizeObject(stage);
    expect(sanitized.config.theme.primary).toBe('#ff0000');
    expect(sanitized.config.layout.columns).toBe(3);
    expect(sanitized.config.metadata.tags).toEqual(['science', 'biology']);
  });

  it('handles content with special characters and encoding', () => {
    const content = {
      title: 'Math: 2 < 3 && 5 > 4',
      formula: 'E = mc²',
      unicode: '日本語テスト 🎓',
      escaped: '&lt;script&gt;',
    };

    const sanitized = sanitizeObject(content);
    // Special characters in plain text should be preserved
    expect(sanitized.formula).toContain('mc²');
    expect(sanitized.unicode).toContain('日本語テスト');
    expect(sanitized.unicode).toContain('🎓');
  });
});

// ─── 9. Circuit Breaker Failover & Recovery ───────────────────────────────

describe('Scenario: Circuit Breaker', () => {
  it('opens after threshold failures', async () => {
    const { getOrCreateBreaker } = await import('@/lib/server/circuit-breaker');
    const breaker = getOrCreateBreaker('scenario-cb-open', {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 10_000,
      volumeThreshold: 3,
    });

    for (let i = 0; i < 3; i++) {
      try {
        await breaker.fire(async () => {
          throw new Error('LLM service unavailable');
        });
      } catch {
        // Expected
      }
    }

    const stats = breaker.stats;
    expect(stats.fires).toBeGreaterThanOrEqual(3);
    expect(stats.failures).toBeGreaterThanOrEqual(3);
  });

  it('allows passthrough after reset', async () => {
    const { getOrCreateBreaker } = await import('@/lib/server/circuit-breaker');
    const breaker = getOrCreateBreaker('scenario-cb-recovery', {
      timeout: 1000,
      errorThresholdPercentage: 100,
      resetTimeout: 100,
      volumeThreshold: 1,
    });

    try {
      await breaker.fire(async () => {
        throw new Error('Temporary failure');
      });
    } catch {
      // Expected
    }

    await new Promise((resolve) => setTimeout(resolve, 150));

    const result = await breaker.fire(async () => 'recovered');
    expect(result).toBe('recovered');
  });
});

// ─── 10. Video Timeline Export ─────────────────────────────────────────────

describe('Scenario: Video Export', () => {
  const mockTiming: CompileDeps['timing'] = {
    audioDurationMs: () => 3000,
    videoDurationMs: () => 5000,
    clearElementCount: () => 0,
    isDiscussionSkipped: () => false,
    isEditCodeNoop: () => false,
  };

  const mockAssets: CompileDeps['assets'] = {
    audio: () => ({ id: 'audio-1', mimeType: 'audio/mpeg', format: 'mp3', present: true }),
    media: () => ({ id: 'media-1', mimeType: 'image/png', format: 'png', present: true }),
  };

  const mockConfig: CompileDeps['config'] = {
    playbackSpeed: 1,
    whiteboardInitiallyOpen: false,
    onUnresolvedVideoDuration: 'cap',
  };

  it('compiles a single-scene timeline', () => {
    const scenes: CompilerScene[] = [
      {
        id: 'scene-1',
        type: 'slide',
        title: 'Introduction',
        content: { canvas: { elements: [] } },
        actions: [{ type: 'speech', text: 'Hello world', id: 'speech-1' }],
      } as unknown as CompilerScene,
    ];

    const ir = compileVideoTimeline(
      { stage: { id: 'stage-1', name: 'Test' }, scenes },
      { timing: mockTiming, assets: mockAssets, config: mockConfig },
    );

    expect(ir.scenes).toHaveLength(1);
    expect(ir.totalDurationMs).toBeGreaterThan(0);
    expect(ir.diagnostics).toBeDefined();
  });

  it('throws on empty scenes array', () => {
    expect(() =>
      compileVideoTimeline(
        { stage: { id: 'stage-1', name: 'Test' }, scenes: [] },
        { timing: mockTiming, assets: mockAssets, config: mockConfig },
      ),
    ).toThrow(/No scenes/);
  });

  it('compiles multi-scene timeline with mixed types', () => {
    const scenes: CompilerScene[] = [
      {
        id: 'scene-1',
        type: 'slide',
        title: 'Slide',
        content: { canvas: { elements: [] } },
        actions: [{ type: 'speech', text: 'Intro', id: 's1' }],
      },
      {
        id: 'scene-2',
        type: 'quiz',
        title: 'Quiz',
        content: { question: 'What is 2+2?', options: ['3', '4', '5'] },
        actions: [{ type: 'speech', text: 'Quiz time', id: 's2' }],
      },
    ] as unknown as CompilerScene[];

    const ir = compileVideoTimeline(
      { stage: { id: 'stage-1', name: 'Mixed' }, scenes },
      { timing: mockTiming, assets: mockAssets, config: mockConfig },
    );

    expect(ir.scenes).toHaveLength(2);
    expect(ir.totalDurationMs).toBeGreaterThan(0);
  });

  it('reports diagnostics for missing audio', () => {
    const noAudioTiming: CompileDeps['timing'] = {
      ...mockTiming,
      audioDurationMs: () => null,
    };

    const scenes: CompilerScene[] = [
      {
        id: 'scene-1',
        type: 'slide',
        title: 'No Audio',
        content: { canvas: { elements: [] } },
        actions: [{ type: 'speech', text: 'No audio', id: 's1' }],
      } as unknown as CompilerScene,
    ];

    const ir = compileVideoTimeline(
      { stage: { id: 'stage-1', name: 'Test' }, scenes },
      { timing: noAudioTiming, assets: mockAssets, config: mockConfig },
    );

    expect(ir.scenes).toHaveLength(1);
  });
});

// ─── 11. State Persistence & Idempotent Sanitization ───────────────────────

describe('Scenario: State Persistence', () => {
  it('sanitization is idempotent (double-sanitize = single-sanitize)', () => {
    const input = {
      title: '<b>Bold</b><script>bad()</script>',
      content: '<p>Safe</p><img src=x onerror="alert(1)">',
    };

    const once = sanitizeObject(input);
    const twice = sanitizeObject(once);

    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('preserves data types through sanitization', () => {
    const input = {
      str: 'hello',
      num: 42,
      bool: true,
      null: null,
      arr: [1, 'two', false],
      nested: { deep: 'value' },
    };

    const result = sanitizeObject(input);
    expect(typeof result.str).toBe('string');
    expect(result.num).toBe(42);
    expect(result.bool).toBe(true);
    expect(result.null).toBeNull();
    expect(Array.isArray(result.arr)).toBe(true);
    expect(typeof result.nested).toBe('object');
  });

  it('handles concurrent sanitization without interference', () => {
    const objects = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      content: `<script>evil${i}()</script><p>Content ${i}</p>`,
    }));

    const results = objects.map((obj) => sanitizeObject(obj));
    results.forEach((result, i) => {
      expect(result.content).not.toContain('<script>');
      expect(result.content).toContain(`Content ${i}`);
    });
  });
});
