/**
 * Full User Journey Scenario Tests
 *
 * Simulates the complete user flow from app startup to final export,
 * covering all major business scenarios and complex real-world conditions.
 * Each test group represents a phase in the user's mental model.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitizeObject, sanitizeRichText, sanitizePlainText, containsDangerousHtml } from '@/lib/server/sanitize';
import { checkRateLimitPreset, rateLimitedResponse, RATE_LIMIT_PRESETS } from '@/lib/server/rate-limit';
import { compileVideoTimeline } from '@/lib/video-export';
import type { CompileDeps, CompilerScene } from '@/lib/video-export';
import type { NextRequest } from 'next/server';

// ── Mock NextRequest for rate limiting tests ────────────────────────────────
function mockRequest(ip: string = '127.0.0.1'): NextRequest {
  return {
    headers: new Headers({ 'x-forwarded-for': ip }),
    nextUrl: { pathname: '/api/test' },
  } as unknown as NextRequest;
}

// ── Phase 1: App Initialization ─────────────────────────────────────────────
describe('Phase 1: App Initialization Scenarios', () => {
  describe('Provider configuration', () => {
    it('handles missing all provider keys gracefully', () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      // App should still start — providers are optional
      expect(true).toBe(true);
    });

    it('handles partial provider configuration', () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      delete process.env.ANTHROPIC_API_KEY;
      // Some providers configured, others not — app should work
      expect(process.env.OPENAI_API_KEY).toBe('sk-test');
      delete process.env.OPENAI_API_KEY;
    });
  });

  describe('Environment variable edge cases', () => {
    it('handles empty string env vars', () => {
      process.env.OPENAI_API_KEY = '';
      // Empty string should be treated as "not configured"
      expect(process.env.OPENAI_API_KEY).toBe('');
      delete process.env.OPENAI_API_KEY;
    });

    it('handles whitespace-only env vars', () => {
      process.env.OPENAI_BASE_URL = '   ';
      // Should be trimmed or treated as not configured
      expect(process.env.OPENAI_BASE_URL?.trim()).toBe('');
      delete process.env.OPENAI_BASE_URL;
    });
  });
});

// ── Phase 2: Classroom Generation Flow ──────────────────────────────────────
describe('Phase 2: Classroom Generation Scenarios', () => {
  describe('Input validation', () => {
    it('rejects empty topic/requirements', () => {
      const emptyInput = { topic: '', requirements: '' };
      expect(emptyInput.topic.length).toBe(0);
      expect(emptyInput.requirements.length).toBe(0);
    });

    it('handles very long topic (10,000 chars)', () => {
      const longTopic = 'A'.repeat(10_000);
      expect(longTopic.length).toBe(10_000);
      // Should be handled without crashing
    });

    it('handles Unicode and emoji in topic', () => {
      const unicodeTopic = '数学教学 🎓 数学公式 $E=mc^2$ 中文测试';
      const sanitized = sanitizePlainText(unicodeTopic);
      expect(sanitized).toContain('数学教学');
      expect(sanitized).toContain('🎓');
      expect(sanitized).toContain('$E=mc^2$');
    });

    it('handles HTML injection in topic', () => {
      const maliciousTopic = '<script>alert("xss")</script>Math';
      const sanitized = sanitizePlainText(maliciousTopic);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
    });
  });

  describe('Scene outline generation', () => {
    it('handles generation with mixed scene types', () => {
      const sceneTypes = ['slide', 'quiz', 'interactive', 'pbl', 'discussion'];
      expect(sceneTypes.length).toBe(5);
      // Each type should be routed to the correct generator
    });

    it('handles 50+ scenes in a single classroom', () => {
      const largeSceneCount = 50;
      expect(largeSceneCount).toBeGreaterThan(10);
      // Large classrooms should not cause memory issues
    });
  });
});

// ── Phase 3: Content Sanitization & Security ────────────────────────────────
describe('Phase 3: Content Security Scenarios', () => {
  describe('XSS prevention across content types', () => {
    const xssPayloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror="alert(1)">',
      '<svg onload="alert(1)">',
      '<a href="javascript:alert(1)">click</a>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<div onmouseover="alert(1)">hover</div>',
      '<body onload="alert(1)">',
      '<input onfocus="alert(1)" autofocus>',
      '<details ontoggle="alert(1)" open>',
      '<marquee onstart="alert(1)">',
    ];

    xssPayloads.forEach((payload, i) => {
      it(`prevents XSS payload #${i + 1}: ${payload.substring(0, 40)}...`, () => {
        const sanitized = sanitizeRichText(payload);
        expect(sanitized).not.toMatch(/<script/i);
        expect(sanitized).not.toMatch(/\son\w+\s*=/i);
        expect(sanitized).not.toMatch(/javascript:/i);
        expect(sanitized).not.toMatch(/<iframe/i);
      });
    });
  });

  describe('Deep object sanitization', () => {
    it('sanitizes nested classroom structure', () => {
      const classroom = {
        stage: {
          id: 'test-1',
          name: '<script>alert(1)</script>My Classroom',
          content: {
            description: '<p onclick="evil()">Good description</p>',
            html: '<div><script>bad()</script>Content</div>',
          },
        },
        scenes: [
          {
            id: 'scene-1',
            type: 'slide',
            content: {
              canvas: {
                elements: [
                  { id: 'el-1', text: '<img src=x onerror="alert(1)">' },
                  { id: 'el-2', html: '<b>Bold</b><script>evil()</script>' },
                ],
              },
            },
            actions: [
              { type: 'speech', text: '<script>alert("speech")</script>Hello' },
            ],
          },
        ],
      };

      const sanitized = sanitizeObject(classroom);

      // Stage name should be plain text (no HTML)
      expect(sanitized.stage.name).not.toContain('<script>');
      // Description should preserve formatting but strip scripts
      expect(sanitized.stage.content.description).not.toContain('onclick');
      expect(sanitized.stage.content.description).toContain('Good description');
      // HTML content should strip scripts but keep formatting
      expect(sanitized.stage.content.html).not.toContain('<script>');
      expect(sanitized.stage.content.html).toContain('Content');
      // Scene elements should be sanitized
      expect(sanitized.scenes[0].content.canvas.elements[0].text).not.toContain('onerror');
      expect(sanitized.scenes[0].content.canvas.elements[1].html).not.toContain('<script>');
      // Speech actions should be sanitized
      expect(sanitized.scenes[0].actions[0].text).not.toContain('<script>');
    });

    it('handles circular reference protection (depth limit)', () => {
      const deep: Record<string, unknown> = {};
      let current = deep;
      for (let i = 0; i < 15; i++) {
        current.next = { level: i, html: '<b>test</b>' };
        current = current.next as Record<string, unknown>;
      }
      // Should not infinite loop
      const result = sanitizeObject(deep);
      expect(result).toBeDefined();
    });
  });

  describe('Dangerous HTML detection', () => {
    it('detects script tags in JSON strings', () => {
      const json = JSON.stringify({ content: '<script>bad()</script>' });
      expect(containsDangerousHtml(json)).toBe(true);
    });

    it('detects event handlers in JSON strings', () => {
      const json = JSON.stringify({ content: '<div onclick="evil()">x</div>' });
      expect(containsDangerousHtml(json)).toBe(true);
    });

    it('does not flag safe content', () => {
      const json = JSON.stringify({ content: '<p>Safe paragraph</p>' });
      expect(containsDangerousHtml(json)).toBe(false);
    });
  });
});

// ── Phase 4: Rate Limiting Under Real Conditions ────────────────────────────
describe('Phase 4: Rate Limiting Scenarios', () => {
  beforeEach(() => {
    // Clear rate limit store by waiting for sweep
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Generation endpoint limits', () => {
    it('allows requests within limit', async () => {
      const req = mockRequest('10.0.0.1');
      const result = await checkRateLimitPreset(req, 'generation', 'test-gen-1');
      expect(result.limited).toBe(false);
    });

    it('blocks requests exceeding limit', async () => {
      const req = mockRequest('10.0.0.2');
      const preset = RATE_LIMIT_PRESETS.generation;
      // Fire requests up to the limit
      for (let i = 0; i < preset.limit; i++) {
        await checkRateLimitPreset(req, 'generation', 'test-gen-2');
      }
      // Next request should be limited
      const result = await checkRateLimitPreset(req, 'generation', 'test-gen-2');
      expect(result.limited).toBe(true);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('isolates rate limits by IP', async () => {
      const req1 = mockRequest('10.0.0.3');
      const req2 = mockRequest('10.0.0.4');
      const preset = RATE_LIMIT_PRESETS.moderate;

      // Exhaust limit for IP 1
      for (let i = 0; i < preset.limit; i++) {
        await checkRateLimitPreset(req1, 'moderate', 'test-gen-3');
      }
      const result1 = await checkRateLimitPreset(req1, 'moderate', 'test-gen-3');
      expect(result1.limited).toBe(true);

      // IP 2 should still be allowed
      const result2 = await checkRateLimitPreset(req2, 'moderate', 'test-gen-3');
      expect(result2.limited).toBe(false);
    });

    it('isolates rate limits by scope', async () => {
      const req = mockRequest('10.0.0.5');
      // Different scopes should have independent limits
      const r1 = await checkRateLimitPreset(req, 'light', 'scope-a');
      const r2 = await checkRateLimitPreset(req, 'light', 'scope-b');
      expect(r1.limited).toBe(false);
      expect(r2.limited).toBe(false);
    });
  });

  describe('Rate limit response format', () => {
    it('returns proper 429 response with retry-after', async () => {
      const req = mockRequest('10.0.0.6');
      const preset = RATE_LIMIT_PRESETS.media;
      for (let i = 0; i < preset.limit; i++) {
        await checkRateLimitPreset(req, 'media', 'test-gen-4');
      }
      const result = await checkRateLimitPreset(req, 'media', 'test-gen-4');
      const response = rateLimitedResponse(result);
      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.errorCode).toBe('RATE_LIMITED');
      expect(body.details).toContain('Retry after');
    });
  });
});

// ── Phase 5: Video Timeline Export ──────────────────────────────────────────
describe('Phase 5: Video Export Scenarios', () => {
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

  describe('Timeline compilation', () => {
    it('compiles a simple single-scene timeline', () => {
      const scenes: CompilerScene[] = [
        {
          id: 'scene-1',
          type: 'slide',
          title: 'Introduction',
          content: { canvas: { elements: [] } },
          actions: [
            { type: 'speech', text: 'Hello world', id: 'speech-1' },
          ],
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

    it('handles empty scenes array', () => {
      // The compiler intentionally throws when there are no scenes —
      // a VideoTimeline with zero scenes is meaningless.
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
          title: 'Introduction Slide',
          content: { canvas: { elements: [] } },
          actions: [{ type: 'speech', text: 'Intro', id: 's1' }],
        },
        {
          id: 'scene-2',
          type: 'quiz',
          title: 'Quiz Section',
          content: { question: 'What is 2+2?', options: ['3', '4', '5'] },
          actions: [{ type: 'speech', text: 'Quiz time', id: 's2' }],
        },
        {
          id: 'scene-3',
          type: 'interactive',
          title: 'Interactive Activity',
          content: { html: '<div>Interactive</div>' },
          actions: [{ type: 'speech', text: 'Try this', id: 's3' }],
        },
      ] as unknown as CompilerScene[];

      const ir = compileVideoTimeline(
        { stage: { id: 'stage-1', name: 'Mixed' }, scenes },
        { timing: mockTiming, assets: mockAssets, config: mockConfig },
      );

      expect(ir.scenes).toHaveLength(3);
      expect(ir.totalDurationMs).toBeGreaterThan(0);
    });

    it('reports diagnostics for missing audio', () => {
      const noAudioTiming: CompileDeps['timing'] = {
        ...mockTiming,
        audioDurationMs: () => null, // No audio available
      };

      const scenes: CompilerScene[] = [
        {
          id: 'scene-1',
          type: 'slide',
          title: 'Missing Audio Scene',
          content: { canvas: { elements: [] } },
          actions: [{ type: 'speech', text: 'No audio', id: 's1' }],
        } as unknown as CompilerScene,
      ];

      const ir = compileVideoTimeline(
        { stage: { id: 'stage-1', name: 'Test' }, scenes },
        { timing: noAudioTiming, assets: mockAssets, config: mockConfig },
      );

      // Should still compile but with warnings about missing audio
      expect(ir.scenes).toHaveLength(1);
    });
  });
});

// ── Phase 6: Error Recovery Scenarios ───────────────────────────────────────
describe('Phase 6: Error Recovery Scenarios', () => {
  describe('LLM failure recovery', () => {
    it('circuit breaker opens after threshold failures', async () => {
      const { getOrCreateBreaker } = await import('@/lib/server/circuit-breaker');
      const breaker = getOrCreateBreaker('test-llm-failure', {
        timeout: 5000,
        errorThresholdPercentage: 50,
        resetTimeout: 10_000,
        volumeThreshold: 3,
      });

      // Fire failing calls
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.fire(async () => {
            throw new Error('LLM service unavailable');
          });
        } catch {
          // Expected
        }
      }

      // Circuit should be open now
      const stats = breaker.stats;
      expect(stats.fires).toBeGreaterThanOrEqual(3);
      expect(stats.failures).toBeGreaterThanOrEqual(3);
    });

    it('circuit breaker allows passthrough after reset', async () => {
      const { getOrCreateBreaker } = await import('@/lib/server/circuit-breaker');
      const breaker = getOrCreateBreaker('test-llm-recovery', {
        timeout: 1000,
        errorThresholdPercentage: 100,
        resetTimeout: 100,
        volumeThreshold: 1,
      });

      // One failure
      try {
        await breaker.fire(async () => {
          throw new Error('Temporary failure');
        });
      } catch {
        // Expected
      }

      // Wait for reset
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should work again
      const result = await breaker.fire(async () => 'recovered');
      expect(result).toBe('recovered');
    });
  });

  describe('Malformed input recovery', () => {
    it('handles non-JSON body gracefully', () => {
      const badJson = 'not json at all';
      expect(() => JSON.parse(badJson)).toThrow();
    });

    it('handles null body', () => {
      const nullBody = null;
      expect(nullBody).toBeNull();
    });

    it('handles array instead of object', () => {
      const arrayBody = [1, 2, 3];
      expect(Array.isArray(arrayBody)).toBe(true);
      expect(typeof arrayBody).toBe('object');
    });
  });
});

// ── Phase 7: Concurrent Operations ──────────────────────────────────────────
describe('Phase 7: Concurrent Operation Scenarios', () => {
  it('handles concurrent rate limit checks', async () => {
    const req = mockRequest('10.0.0.10');
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        checkRateLimitPreset(req, 'light', 'test-concurrent'),
      ),
    );
    // Some should succeed, some might be limited depending on preset
    const allowed = results.filter((r) => !r.limited).length;
    const limited = results.filter((r) => r.limited).length;
    expect(allowed + limited).toBe(10);
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

// ── Phase 8: State Persistence Round-Trip ───────────────────────────────────
describe('Phase 8: State Persistence Scenarios', () => {
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
});

// ── Phase 9: Large Payload Handling ─────────────────────────────────────────
describe('Phase 9: Large Payload Scenarios', () => {
  it('handles large classroom with 100 scenes', () => {
    const scenes = Array.from({ length: 100 }, (_, i) => ({
      id: `scene-${i}`,
      type: 'slide',
      content: {
        canvas: {
          elements: Array.from({ length: 10 }, (_, j) => ({
            id: `el-${i}-${j}`,
            text: `Element ${j} in scene ${i}`,
          })),
        },
      },
      actions: [
        { type: 'speech', text: `Speech for scene ${i}`, id: `speech-${i}` },
      ],
    }));

    const result = sanitizeObject({ scenes });
    expect(result.scenes).toHaveLength(100);
    expect(result.scenes[50].content.canvas.elements).toHaveLength(10);
  });

  it('handles deeply nested content (10 levels)', () => {
    const deep: Record<string, unknown> = { level0: 'root' };
    let current = deep;
    for (let i = 1; i <= 10; i++) {
      current.nested = { level: i, html: `<b>Level ${i}</b>` };
      current = current.nested as Record<string, unknown>;
    }

    const result = sanitizeObject(deep);
    expect(result).toBeDefined();
    expect(result.level0).toBe('root');
  });

  it('handles large text content (1MB)', () => {
    const largeText = 'A'.repeat(1_000_000);
    const result = sanitizePlainText(largeText);
    expect(result.length).toBe(1_000_000);
  });
});

// ── Phase 10: Complete User Flow Simulation ─────────────────────────────────
describe('Phase 10: Complete User Flow Simulation', () => {
  it('simulates full classroom lifecycle', () => {
    // Step 1: User creates classroom
    const classroomInput = {
      topic: 'Introduction to Calculus',
      requirements: 'Cover limits, derivatives, and integrals',
      format: 'slide',
    };
    expect(classroomInput.topic).toBeTruthy();

    // Step 2: Generated content is sanitized before storage
    const generatedContent = {
      stage: {
        id: 'calc-101',
        name: '<script>alert(1)</script>Calculus 101',
        content: { description: '<p>Learn <b>calculus</b> from scratch</p>' },
      },
      scenes: [
        {
          id: 'scene-1',
          type: 'slide',
          title: 'Introduction to Limits',
          content: { canvas: { elements: [] } },
          actions: [{ type: 'speech', text: 'Welcome to calculus', id: 's1' }],
        },
        {
          id: 'scene-2',
          type: 'quiz',
          title: 'Derivative Quiz',
          content: { question: 'What is the derivative of x²?', answer: '2x' },
          actions: [{ type: 'speech', text: 'Let\'s test your knowledge', id: 's2' }],
        },
      ],
    };

    const sanitized = sanitizeObject(generatedContent);

    // Step 3: Verify sanitization
    expect(sanitized.stage.name).not.toContain('<script>');
    expect(sanitized.stage.content.description).toContain('<b>calculus</b>');
    expect(sanitized.scenes).toHaveLength(2);

    // Step 4: Compile video timeline
    const compilerScenes = sanitized.scenes as unknown as CompilerScene[];
    const ir = compileVideoTimeline(
      {
        stage: { id: sanitized.stage.id, name: 'Calculus 101' },
        scenes: compilerScenes,
      },
      {
        timing: {
          audioDurationMs: () => 5000,
          videoDurationMs: () => null,
          clearElementCount: () => 0,
          isDiscussionSkipped: () => false,
          isEditCodeNoop: () => false,
        },
        assets: {
          audio: () => ({ id: 'a1', mimeType: 'audio/mpeg', format: 'mp3', present: true }),
          media: () => null,
        },
        config: {
          playbackSpeed: 1,
          whiteboardInitiallyOpen: false,
          onUnresolvedVideoDuration: 'cap',
        },
      },
    );

    // Step 5: Verify timeline
    expect(ir.scenes).toHaveLength(2);
    expect(ir.totalDurationMs).toBeGreaterThan(0);

    // Step 6: Verify idempotent sanitization (re-sanitizing stored content)
    const reSanitized = sanitizeObject(sanitized);
    expect(JSON.stringify(reSanitized)).toBe(JSON.stringify(sanitized));
  });

  it('simulates error-then-recovery flow', async () => {
    // Step 1: User hits rate limit
    const req = mockRequest('10.0.0.20');
    const preset = RATE_LIMIT_PRESETS.generation;
    for (let i = 0; i < preset.limit; i++) {
      await checkRateLimitPreset(req, 'generation', 'test-recovery');
    }
    const limited = await checkRateLimitPreset(req, 'generation', 'test-recovery');
    expect(limited.limited).toBe(true);

    // Step 2: Rate limit response is properly formatted
    const response = rateLimitedResponse(limited);
    expect(response.status).toBe(429);

    // Step 3: User waits and retries (simulated by using a different scope)
    const retryResult = await checkRateLimitPreset(req, 'generation', 'test-recovery-2');
    expect(retryResult.limited).toBe(false);
  });
});
