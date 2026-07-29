import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

describe('Webhook System', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendWebhook', () => {
    it('should send a POST request with the correct payload and headers', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response('OK', { status: 200 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { sendWebhook } = await import('@/lib/server/webhook');

      const event = {
        type: 'classroom.created',
        data: { id: 'cls_123' },
        timestamp: Date.now(),
      };

      const result = await sendWebhook('https://example.com/hook', event);

      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledOnce();

      const call = fetchMock.mock.calls[0];
      expect(call[0]).toBe('https://example.com/hook');
      const opts = call[1] as RequestInit;
      expect(opts.method).toBe('POST');

      const headers = opts.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Nova-Event']).toBe('classroom.created');

      const body = JSON.parse(opts.body as string);
      expect(body.type).toBe('classroom.created');
      expect(body.data.id).toBe('cls_123');
    });

    it('should include HMAC-SHA256 signature when secret is provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response('OK', { status: 200 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { sendWebhook } = await import('@/lib/server/webhook');

      const event = {
        type: 'classroom.generated',
        data: { id: 'cls_456' },
        timestamp: 1700000000000,
      };

      const secret = 'test-webhook-secret';
      await sendWebhook('https://example.com/hook', event, secret);

      const call = fetchMock.mock.calls[0];
      const opts = call[1] as RequestInit;
      const headers = opts.headers as Record<string, string>;
      const payload = opts.body as string;

      const expectedSig = createHmac('sha256', secret).update(payload).digest('hex');
      expect(headers['X-Nova-Signature']).toBe(`sha256=${expectedSig}`);
    });

    it('should NOT include signature header when no secret is provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response('OK', { status: 200 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { sendWebhook } = await import('@/lib/server/webhook');

      await sendWebhook('https://example.com/hook', {
        type: 'user.registered',
        data: {},
        timestamp: Date.now(),
      });

      const call = fetchMock.mock.calls[0];
      const opts = call[1] as RequestInit;
      const headers = opts.headers as Record<string, string>;
      expect(headers['X-Nova-Signature']).toBeUndefined();
    });

    it('should return false on non-OK HTTP response', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response('Internal Error', { status: 500 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { sendWebhook } = await import('@/lib/server/webhook');

      const result = await sendWebhook('https://example.com/hook', {
        type: 'test.event',
        data: {},
        timestamp: Date.now(),
      });

      expect(result).toBe(false);
    });

    it('should return false on network error (fetch throws)', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      vi.stubGlobal('fetch', fetchMock);

      const { sendWebhook } = await import('@/lib/server/webhook');

      const result = await sendWebhook('https://example.com/hook', {
        type: 'test.event',
        data: {},
        timestamp: Date.now(),
      });

      expect(result).toBe(false);
    });

    it('should abort after 10 seconds timeout', async () => {
      vi.useFakeTimers();

      const fetchMock = vi.fn().mockImplementation((_url, opts: RequestInit) => {
        return new Promise((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const { sendWebhook } = await import('@/lib/server/webhook');

      const promise = sendWebhook('https://slow.example.com/hook', {
        type: 'test.event',
        data: {},
        timestamp: Date.now(),
      });

      vi.advanceTimersByTime(10_500);

      const result = await promise;
      expect(result).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('broadcastWebhook', () => {
    it('should send to all endpoints when events list is empty', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response('OK', { status: 200 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { broadcastWebhook } = await import('@/lib/server/webhook');

      const endpoints = [
        { url: 'https://a.example.com/hook', events: [] },
        { url: 'https://b.example.com/hook', events: [] },
      ];

      await broadcastWebhook(endpoints, {
        type: 'classroom.created',
        data: {},
        timestamp: Date.now(),
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should only send to endpoints subscribed to the event type', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response('OK', { status: 200 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { broadcastWebhook } = await import('@/lib/server/webhook');

      const endpoints = [
        { url: 'https://a.example.com/hook', events: ['classroom.created'] },
        { url: 'https://b.example.com/hook', events: ['user.registered'] },
      ];

      await broadcastWebhook(endpoints, {
        type: 'classroom.created',
        data: {},
        timestamp: Date.now(),
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe('https://a.example.com/hook');
    });

    it('should not throw when one endpoint fails', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response('OK', { status: 200 }))
        .mockRejectedValueOnce(new Error('Network error'));
      vi.stubGlobal('fetch', fetchMock);

      const { broadcastWebhook } = await import('@/lib/server/webhook');

      const endpoints = [
        { url: 'https://a.example.com/hook', events: [] },
        { url: 'https://b.example.com/hook', events: [] },
      ];

      // Should not throw
      await expect(
        broadcastWebhook(endpoints, {
          type: 'test.event',
          data: {},
          timestamp: Date.now(),
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('WebhookEvents constants', () => {
    it('should expose all expected event types', async () => {
      const { WebhookEvents } = await import('@/lib/server/webhook');

      expect(WebhookEvents.CLASSROOM_CREATED).toBe('classroom.created');
      expect(WebhookEvents.CLASSROOM_GENERATED).toBe('classroom.generated');
      expect(WebhookEvents.CLASSROOM_GENERATION_FAILED).toBe('classroom.generation_failed');
      expect(WebhookEvents.CLASSROOM_UPDATED).toBe('classroom.updated');
      expect(WebhookEvents.CLASSROOM_DELETED).toBe('classroom.deleted');
      expect(WebhookEvents.USER_REGISTERED).toBe('user.registered');
      expect(WebhookEvents.QUOTA_EXCEEDED).toBe('quota.exceeded');
    });
  });
});
