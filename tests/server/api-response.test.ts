import { describe, test, expect, vi } from 'vitest';

// Silence the logger used by `apiErrorLogged` so test output stays clean.
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  apiError,
  apiSuccess,
  apiErrorLogged,
  API_ERROR_CODES,
} from '@/lib/server/api-response';

describe('API_ERROR_CODES', () => {
  test('every value is a string', () => {
    for (const value of Object.values(API_ERROR_CODES)) {
      expect(typeof value).toBe('string');
    }
  });

  test('contains the expected sentinel codes', () => {
    expect(API_ERROR_CODES.INVALID_CREDENTIALS).toBe('INVALID_CREDENTIALS');
    expect(API_ERROR_CODES.RATE_LIMITED).toBe('RATE_LIMITED');
    expect(API_ERROR_CODES.UPSTREAM_ERROR).toBe('UPSTREAM_ERROR');
    expect(API_ERROR_CODES.MODEL_NOT_FOUND).toBe('MODEL_NOT_FOUND');
    expect(API_ERROR_CODES.MODEL_ACCESS_DENIED).toBe('MODEL_ACCESS_DENIED');
    expect(API_ERROR_CODES.GENERATION_FAILED).toBe('GENERATION_FAILED');
    expect(API_ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    expect(API_ERROR_CODES.MISSING_REQUIRED_FIELD).toBe('MISSING_REQUIRED_FIELD');
    expect(API_ERROR_CODES.CONNECTION_TIMEOUT).toBe('CONNECTION_TIMEOUT');
  });
});

describe('apiError', () => {
  test('returns the correct status code, errorCode, and error message', async () => {
    const res = apiError('INVALID_CREDENTIALS', 401, 'Authentication failed');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({
      success: false,
      errorCode: 'INVALID_CREDENTIALS',
      error: 'Authentication failed',
    });
  });

  test('serializes details and context when both are provided', async () => {
    const res = apiError(
      'UPSTREAM_ERROR',
      502,
      'Upstream failed',
      'provider returned 503',
      'Generating scene 3: Photosynthesis',
    );
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      errorCode: 'UPSTREAM_ERROR',
      error: 'Upstream failed',
      details: 'provider returned 503',
      context: 'Generating scene 3: Photosynthesis',
    });
  });

  test('omits details and context fields when neither is provided', async () => {
    const res = apiError('RATE_LIMITED', 429, 'Too many requests');
    const body = await res.json();
    expect(body).not.toHaveProperty('details');
    expect(body).not.toHaveProperty('context');
    expect(body).toEqual({
      success: false,
      errorCode: 'RATE_LIMITED',
      error: 'Too many requests',
    });
  });

  test('omits details when only context is provided', async () => {
    const res = apiError(
      'MODEL_NOT_FOUND',
      404,
      'Model not found',
      undefined,
      'Resolving model for scene-content',
    );
    const body = await res.json();
    expect(body).not.toHaveProperty('details');
    expect(body.context).toBe('Resolving model for scene-content');
  });
});

describe('apiSuccess', () => {
  test('returns 200 with success:true merged into data', async () => {
    const res = apiSuccess({ model: 'gpt-4o', valid: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      model: 'gpt-4o',
      valid: true,
    });
  });

  test('accepts a custom status code', async () => {
    const res = apiSuccess({ created: true }, 201);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.created).toBe(true);
  });
});

describe('apiErrorLogged', () => {
  test('returns the same response body and status as apiError', async () => {
    const logged = apiErrorLogged('UPSTREAM_ERROR', 502, 'Upstream failed', {
      details: 'detail-string',
      context: 'context-string',
    });
    const plain = apiError('UPSTREAM_ERROR', 502, 'Upstream failed', 'detail-string', 'context-string');

    expect(logged.status).toBe(plain.status);

    const loggedBody = await logged.json();
    const plainBody = await plain.json();
    expect(loggedBody).toEqual(plainBody);
  });

  test('produces the correct body and status with options', async () => {
    const res = apiErrorLogged('INVALID_CREDENTIALS', 401, 'Auth failed', {
      context: 'verify-model stage',
      label: 'VerifyModel',
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({
      success: false,
      errorCode: 'INVALID_CREDENTIALS',
      error: 'Auth failed',
      context: 'verify-model stage',
    });
    expect(body).not.toHaveProperty('details');
  });

  test('works without any options', async () => {
    const res = apiErrorLogged('INTERNAL_ERROR', 500, 'Something went wrong');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      errorCode: 'INTERNAL_ERROR',
      error: 'Something went wrong',
    });
  });
});
