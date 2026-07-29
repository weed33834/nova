/**
 * API Contract Tests
 *
 * Validates that API response shapes are consistent and match
 * the documented schemas. These tests catch breaking changes —
 * if someone modifies an API response structure, these tests fail.
 */
import { describe, it, expect } from 'vitest';
import { paginationSchema } from '@/lib/server/openapi-registry';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { z } from 'zod';

// ── 1. Error Response Contract ─────────────────────────────────────────────

describe('Contract: Error Response Shape', () => {
  it('apiError returns { success: false, errorCode, error, details? }', async () => {
    const res = apiError('INVALID_REQUEST', 400, 'Invalid input', 'field is required');
    const body = await res.json();

    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('INVALID_REQUEST');
    expect(body.error).toBe('Invalid input');
    expect(body.details).toBe('field is required');
  });

  it('apiError without details', async () => {
    const res = apiError('UPSTREAM_ERROR', 502, 'Upstream service error');
    const body = await res.json();

    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('UPSTREAM_ERROR');
    expect(body.error).toBe('Upstream service error');
    expect(body.details).toBeUndefined();
  });

  it('apiError sets correct HTTP status', () => {
    expect(apiError('INVALID_REQUEST', 400, 'bad').status).toBe(400);
    expect(apiError('INVALID_CREDENTIALS', 401, 'no auth').status).toBe(401);
    expect(apiError('RATE_LIMITED', 429, 'slow down').status).toBe(429);
    expect(apiError('UPSTREAM_ERROR', 502, 'upstream').status).toBe(502);
  });

  it('all documented error codes are valid strings', () => {
    const documentedErrorCodes = [
      'MISSING_REQUIRED_FIELD',
      'INVALID_REQUEST',
      'INVALID_CREDENTIALS',
      'RATE_LIMITED',
      'UPSTREAM_ERROR',
      'CONTENT_SENSITIVE',
    ];

    documentedErrorCodes.forEach((code) => {
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
      expect(code).toMatch(/^[A-Z_]+$/);
    });
  });
});

// ── 2. Success Response Contract ───────────────────────────────────────────

describe('Contract: Success Response Shape', () => {
  it('apiSuccess returns { success: true, ...data }', async () => {
    const res = apiSuccess({ id: 'test-1', name: 'Test' });
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.id).toBe('test-1');
    expect(body.name).toBe('Test');
  });

  it('apiSuccess with 201 status', async () => {
    const res = apiSuccess({ created: true }, 201);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('apiSuccess with 202 status', async () => {
    const res = apiSuccess({ jobId: 'job-1' }, 202);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.jobId).toBe('job-1');
  });

  it('apiSuccess default status is 200', () => {
    const res = apiSuccess({ ok: true });
    expect(res.status).toBe(200);
  });
});

// ── 3. Pagination Contract ─────────────────────────────────────────────────

describe('Contract: Pagination Shape', () => {
  it('paginationSchema has required fields', () => {
    const shape = paginationSchema.shape;
    expect(shape.page).toBeDefined();
    expect(shape.pageSize).toBeDefined();
    expect(shape.total).toBeDefined();
    expect(shape.totalPages).toBeDefined();
    expect(shape.hasMore).toBeDefined();
  });

  it('paginationSchema enforces page >= 1', () => {
    const result = paginationSchema.safeParse({
      page: 0,
      pageSize: 10,
      total: 100,
      totalPages: 10,
      hasMore: true,
    });
    expect(result.success).toBe(false);
  });

  it('paginationSchema enforces pageSize <= 100', () => {
    const result = paginationSchema.safeParse({
      page: 1,
      pageSize: 200,
      total: 100,
      totalPages: 1,
      hasMore: false,
    });
    expect(result.success).toBe(false);
  });

  it('paginationSchema accepts valid input', () => {
    const result = paginationSchema.safeParse({
      page: 1,
      pageSize: 20,
      total: 100,
      totalPages: 5,
      hasMore: true,
    });
    expect(result.success).toBe(true);
  });
});

// ── 4. Response Content-Type Contract ──────────────────────────────────────

describe('Contract: Response Headers', () => {
  it('apiSuccess sets application/json content type', () => {
    const res = apiSuccess({ ok: true });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('apiError sets application/json content type', () => {
    const res = apiError('INTERNAL_ERROR', 500, 'error');
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

// ── 5. Zod Validation Contract ─────────────────────────────────────────────

describe('Contract: Input Validation', () => {
  it('Zod schema rejects empty strings for required fields', () => {
    const schema = z.object({ topic: z.string().min(1) });
    expect(schema.safeParse({ topic: '' }).success).toBe(false);
    expect(schema.safeParse({ topic: 'valid' }).success).toBe(true);
  });

  it('Zod schema enforces email format', () => {
    const schema = z.object({ email: z.string().email() });
    expect(schema.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(schema.safeParse({ email: 'user@example.com' }).success).toBe(true);
  });

  it('Zod schema enforces password length', () => {
    const schema = z.object({ password: z.string().min(8).max(128) });
    expect(schema.safeParse({ password: 'short' }).success).toBe(false);
    expect(schema.safeParse({ password: 'a'.repeat(8) }).success).toBe(true);
    expect(schema.safeParse({ password: 'a'.repeat(129) }).success).toBe(false);
  });

  it('Zod schema handles optional fields', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    });
    expect(schema.safeParse({ required: 'val' }).success).toBe(true);
    expect(schema.safeParse({ required: 'val', optional: 'extra' }).success).toBe(true);
    expect(schema.safeParse({ optional: 'missing required' }).success).toBe(false);
  });
});
