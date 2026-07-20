import { describe, test, expect, vi } from 'vitest';
import { APICallError, RetryError } from 'ai';

// Silence the logger pulled in transitively via `api-response.ts`.
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  llmApiError,
  upstreamStatusFromError,
  sanitizedErrorDetails,
} from '@/lib/server/llm-error-response';

/**
 * Build a real `APICallError` instance carrying sensitive-looking fields
 * (URL, response body, request body) so we can verify they never leak.
 */
function makeApiCallError(
  statusCode: number,
  message = `upstream ${statusCode}`,
): APICallError {
  return new APICallError({
    message,
    url: 'https://api.example.com/v1/chat/completions',
    requestBodyValues: { model: 'gpt-4o', apiKey: 'sk-secret-12345' },
    statusCode,
    responseHeaders: { 'content-type': 'application/json' },
    responseBody: `{"error":"status ${statusCode}", "key":"sk-secret-12345"}`,
  });
}

function makeRetryError(errors: Error[]): RetryError {
  return new RetryError({
    message: 'retry exhausted',
    reason: 'maxRetriesExceeded',
    errors,
  });
}

describe('llmApiError', () => {
  test('401 → INVALID_CREDENTIALS / 401', async () => {
    const res = llmApiError(makeApiCallError(401));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({
      success: false,
      errorCode: 'INVALID_CREDENTIALS',
    });
  });

  test('403 → MODEL_ACCESS_DENIED / 403', async () => {
    const res = llmApiError(makeApiCallError(403));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.errorCode).toBe('MODEL_ACCESS_DENIED');
  });

  test('404 → MODEL_NOT_FOUND / 404', async () => {
    const res = llmApiError(makeApiCallError(404));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.errorCode).toBe('MODEL_NOT_FOUND');
  });

  test('429 → RATE_LIMITED / 429', async () => {
    const res = llmApiError(makeApiCallError(429));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.errorCode).toBe('RATE_LIMITED');
  });

  test('500 → UPSTREAM_ERROR / 502 (never mirrors upstream 5xx)', async () => {
    const res = llmApiError(makeApiCallError(500));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.errorCode).toBe('UPSTREAM_ERROR');
  });

  test('503 → UPSTREAM_ERROR / 502', async () => {
    const res = llmApiError(makeApiCallError(503));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.errorCode).toBe('UPSTREAM_ERROR');
  });

  test('plain Error without a status → INTERNAL_ERROR / 500', async () => {
    const res = llmApiError(new Error('something broke'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.errorCode).toBe('INTERNAL_ERROR');
    expect(body.success).toBe(false);
  });

  test('includes context in the body when provided', async () => {
    const res = llmApiError(makeApiCallError(401), 'verify-model stage');
    const body = await res.json();
    expect(body.context).toBe('verify-model stage');
  });

  test('context is omitted when not provided', async () => {
    const res = llmApiError(makeApiCallError(429));
    const body = await res.json();
    expect(body).not.toHaveProperty('context');
    expect(body).not.toHaveProperty('details');
  });
});

describe('upstreamStatusFromError', () => {
  test('extracts the status from an APICallError', () => {
    expect(upstreamStatusFromError(makeApiCallError(429))).toBe(429);
    expect(upstreamStatusFromError(makeApiCallError(401))).toBe(401);
  });

  test('extracts status from a RetryError via its lastError', () => {
    const retry = makeRetryError([makeApiCallError(503), makeApiCallError(401)]);
    // lastError is the final element of `errors` → 401
    expect(upstreamStatusFromError(retry)).toBe(401);
  });

  test('falls back to scanning RetryError.errors when lastError has no status', () => {
    const retry = makeRetryError([
      new Error('no status'),
      makeApiCallError(503),
      new Error('also no status'),
    ]);
    // lastError ("also no status") has no status → scan errors for the first
    // nested status → 503.
    expect(upstreamStatusFromError(retry)).toBe(503);
  });

  test('returns undefined for a plain Error without status', () => {
    expect(upstreamStatusFromError(new Error('no status here'))).toBeUndefined();
  });

  test('returns undefined for null / undefined / non-error values', () => {
    expect(upstreamStatusFromError(null)).toBeUndefined();
    expect(upstreamStatusFromError(undefined)).toBeUndefined();
    expect(upstreamStatusFromError('string')).toBeUndefined();
    expect(upstreamStatusFromError(42)).toBeUndefined();
  });
});

describe('sanitizedErrorDetails', () => {
  test('returns the generic 401 message and does not leak URL, response body, or API key', () => {
    const error = makeApiCallError(401);
    const details = sanitizedErrorDetails(error);
    expect(details).toBe(
      'Authentication failed. Please verify your API key for the model provider.',
    );
    expect(details).not.toContain('sk-secret-12345');
    expect(details).not.toContain('api.example.com');
    expect(details).not.toContain('response body');
    expect(details).not.toContain('invalid api key');
  });

  test('returns the generic 429 message without leaking rate-limit details', () => {
    const error = makeApiCallError(429);
    const details = sanitizedErrorDetails(error);
    expect(details).toBe('Upstream rate limit reached. Please try again shortly.');
    expect(details).not.toContain('sk-secret-12345');
    expect(details).not.toContain('api.example.com');
  });

  test('returns the generic 5xx message for 500+ errors', () => {
    const error = makeApiCallError(503);
    const details = sanitizedErrorDetails(error);
    expect(details).toBe(
      'Upstream model provider is temporarily unavailable. Please try again.',
    );
  });

  test('surfaces a plain Error message (no upstream status) as-is', () => {
    expect(sanitizedErrorDetails(new Error('local config error'))).toBe(
      'local config error',
    );
  });
});
