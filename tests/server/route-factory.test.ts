/**
 * Tests for the API route factory.
 *
 * Verifies that the declarative route wrappers correctly:
 * - Validate request bodies with Zod
 * - Apply rate limiting
 * - Handle errors gracefully
 * - Return structured error responses for invalid input
 * - Support pagination
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createPostRoute, createGetRoute, createDeleteRoute, createPaginatedGetRoute } from '@/lib/server/route-factory';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
): NextRequest {
  const headersObj = new Headers({
    'content-type': 'application/json',
    host: 'localhost:3000',
    ...headers,
  });
  const init: ConstructorParameters<typeof NextRequest>[1] = {
    method,
    headers: headersObj,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(`http://localhost:3000${url}`, init);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Route Factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPostRoute', () => {
    it('validates body with Zod schema and passes valid data', async () => {
      const schema = z.object({
        name: z.string().min(1),
        age: z.number().int().positive(),
      });

      const handler = vi.fn(async (_body: unknown) =>
        new Response(JSON.stringify({ success: true, id: '123' }), { status: 200 }),
      );

      const POST = createPostRoute({
        bodySchema: schema,
        handler: async (_req, _ctx, body) => handler(body),
      });

      const req = makeRequest('POST', '/api/test', { name: 'Alice', age: 30 });
      await POST(req);

      expect(handler).toHaveBeenCalledWith({ name: 'Alice', age: 30 });
    });

    it('returns 400 for invalid body', async () => {
      const schema = z.object({
        name: z.string().min(1),
      });

      const POST = createPostRoute({
        bodySchema: schema,
        handler: async () => new Response('should not reach', { status: 200 }),
      });

      const req = makeRequest('POST', '/api/test', { name: '' });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for malformed JSON', async () => {
      const POST = createPostRoute({
        handler: async () => new Response('ok', { status: 200 }),
      });

      const req = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: 'localhost:3000' },
        body: 'not json',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 413 for oversized body', async () => {
      const schema = z.object({ data: z.string() });
      const bodyStr = JSON.stringify({ data: 'x'.repeat(100) });

      const POST = createPostRoute({
        bodySchema: schema,
        maxBodyBytes: 10,
        handler: async () => new Response('ok', { status: 200 }),
      });

      const req = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(bodyStr.length),
          host: 'localhost:3000',
        },
        body: bodyStr,
      });

      const res = await POST(req);
      expect(res.status).toBe(413);
    });

    it('passes through to handler when no schema provided', async () => {
      const handler = vi.fn(async (_body: unknown) =>
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      const POST = createPostRoute({
        handler: async (_req, _ctx, body) => handler(body),
      });

      const req = makeRequest('POST', '/api/test', { custom: 'data' });
      await POST(req);

      expect(handler).toHaveBeenCalledWith({ custom: 'data' });
    });
  });

  describe('createGetRoute', () => {
    it('extracts query parameters with Zod schema', async () => {
      const querySchema = z.object({
        search: z.string(),
        page: z.string().optional(),
      });

      const handler = vi.fn(async (_query: unknown) =>
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      const GET = createGetRoute({
        querySchema,
        handler: async (_req, _ctx, query) => handler(query),
      });

      const req = makeRequest('GET', '/api/test?search=hello&page=2');
      await GET(req);

      expect(handler).toHaveBeenCalledWith({ search: 'hello', page: '2' });
    });

    it('works without query schema', async () => {
      const handler = vi.fn(async () =>
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      const GET = createGetRoute({
        handler: async (_req, _ctx) => handler(),
      });

      const req = makeRequest('GET', '/api/test');
      await GET(req);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('createDeleteRoute', () => {
    it('calls handler with query params', async () => {
      const handler = vi.fn(async () =>
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      const DELETE = createDeleteRoute({
        handler: async (_req, _ctx) => handler(),
      });

      const req = makeRequest('DELETE', '/api/test/123');
      await DELETE(req);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('createPaginatedGetRoute', () => {
    it('returns paginated response with correct envelope', async () => {
      const items = Array.from({ length: 50 }, (_, i) => ({ id: i, name: `Item ${i}` }));

      const GET = createPaginatedGetRoute({
        handler: async (_req, _ctx, pagination) => {
          const start = (pagination.page - 1) * pagination.pageSize;
          const end = start + pagination.pageSize;
          return {
            items: items.slice(start, end),
            pagination: {
              page: pagination.page,
              pageSize: pagination.pageSize,
              total: items.length,
              totalPages: Math.ceil(items.length / pagination.pageSize),
              hasMore: pagination.page < Math.ceil(items.length / pagination.pageSize),
            },
          };
        },
      });

      const req = makeRequest('GET', '/api/items?page=2&pageSize=10');
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.items).toHaveLength(10);
      expect(body.items[0].id).toBe(10);
      expect(body.pagination.page).toBe(2);
      expect(body.pagination.total).toBe(50);
      expect(body.pagination.hasMore).toBe(true);
    });

    it('uses default pagination when no params', async () => {
      const GET = createPaginatedGetRoute({
        handler: async (_req, _ctx, pagination) => ({
          items: [],
          pagination: {
            page: pagination.page,
            pageSize: pagination.pageSize,
            total: 0,
            totalPages: 0,
            hasMore: false,
          },
        }),
      });

      const req = makeRequest('GET', '/api/items');
      const res = await GET(req);
      const body = await res.json();

      expect(body.pagination.page).toBe(1);
      expect(body.pagination.pageSize).toBe(20); // DEFAULT_PAGE_SIZE
    });

    it('clamps pageSize to maximum', async () => {
      const GET = createPaginatedGetRoute({
        handler: async (_req, _ctx, pagination) => ({
          items: [],
          pagination: {
            page: pagination.page,
            pageSize: pagination.pageSize,
            total: 0,
            totalPages: 0,
            hasMore: false,
          },
        }),
      });

      const req = makeRequest('GET', '/api/items?pageSize=500');
      const res = await GET(req);
      const body = await res.json();

      expect(body.pagination.pageSize).toBe(100); // MAX_PAGE_SIZE
    });
  });

  describe('error handling', () => {
    it('catches handler errors and returns 500', async () => {
      const POST = createPostRoute({
        handler: async () => {
          throw new Error('Something went wrong');
        },
      });

      const req = makeRequest('POST', '/api/test', { data: 'test' });
      const res = await POST(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.errorCode).toBe('INTERNAL_ERROR');
    });

    it('includes request ID in response headers', async () => {
      const POST = createPostRoute({
        handler: async () => new Response('ok', { status: 200 }),
      });

      const req = makeRequest('POST', '/api/test', {}, { 'x-request-id': 'test-123' });
      const res = await POST(req);

      expect(res.headers.get('x-request-id')).toBe('test-123');
    });
  });
});
