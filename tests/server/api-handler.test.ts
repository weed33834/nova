import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withApiHandler } from '@/lib/server/api-handler';
import { NextRequest } from 'next/server';

function mockRequest(
  method: string = 'POST',
  pathname: string = '/api/test',
  body?: unknown,
): NextRequest {
  const url = `http://localhost:3000${pathname}`;
  const headers: Record<string, string> = { 'content-type': 'application/json', host: 'localhost:3000' };
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method,
    headers,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new NextRequest(url, init as any);
}

describe('withApiHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wraps a handler and passes through successful responses', async () => {
    const handler = vi.fn(async () => {
      return new Response(JSON.stringify({ success: true, data: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const wrapped = withApiHandler(handler);
    const req = mockRequest('POST', '/api/test');
    const res = await wrapped(req);

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('injects x-request-id into response headers', async () => {
    const handler = vi.fn(async () => new Response('ok', { status: 200 }));
    const wrapped = withApiHandler(handler);

    const req = mockRequest('GET', '/api/test');
    const res = await wrapped(req);

    const requestId = res.headers.get('x-request-id');
    expect(requestId).toBeTruthy();
    expect(requestId).toHaveLength(8); // UUID slice(0, 8)
  });

  it('preserves existing x-request-id from request header', async () => {
    const handler = vi.fn(async () => new Response('ok', { status: 200 }));
    const wrapped = withApiHandler(handler);

    const url = 'http://localhost:3000/api/test';
    const req = new NextRequest(url, {
      method: 'GET',
      headers: { 'x-request-id': 'custom-req-id', host: 'localhost:3000' },
    });
    const res = await wrapped(req);

    expect(res.headers.get('x-request-id')).toBe('custom-req-id');
  });

  it('catches unhandled errors and returns 500', async () => {
    const handler = vi.fn(async () => {
      throw new Error('Unexpected failure');
    });
    const wrapped = withApiHandler(handler);

    const req = mockRequest('POST', '/api/test');
    const res = await wrapped(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('INTERNAL_ERROR');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('catches AuthRequiredError and returns 401', async () => {
    const handler = vi.fn(async () => {
      const err = new Error('Authentication required');
      err.name = 'AuthRequiredError';
      throw err;
    });
    const wrapped = withApiHandler(handler);

    const req = mockRequest('POST', '/api/test');
    const res = await wrapped(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.errorCode).toBe('INVALID_CREDENTIALS');
  });

  it('catches ForbiddenError and returns 403', async () => {
    const handler = vi.fn(async () => {
      const err = new Error('Forbidden: missing permission "user:manage"');
      err.name = 'ForbiddenError';
      throw err;
    });
    const wrapped = withApiHandler(handler);

    const req = mockRequest('POST', '/api/test');
    const res = await wrapped(req);

    expect(res.status).toBe(403);
  });

  it('passes context with requestId and logger to handler', async () => {
    const handler = vi.fn(async (_req, ctx) => {
      expect(ctx.requestId).toBeTruthy();
      expect(ctx.log).toBeDefined();
      expect(typeof ctx.log.info).toBe('function');
      return new Response('ok', { status: 200 });
    });
    const wrapped = withApiHandler(handler);

    const req = mockRequest('GET', '/api/test');
    await wrapped(req);

    expect(handler).toHaveBeenCalledTimes(1);
    const ctx = handler.mock.calls[0][1];
    expect(ctx.requestId).toHaveLength(8);
  });
});
